import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, ProjectShopifyConnection } from "@/types/database";
import {
  isAccessDenied,
  shopifyGraphql,
  type GraphQlError,
  type GraphQlResponse,
} from "@/lib/shopify/admin";
import { decryptSecret } from "@/lib/shopify/crypto";
import { missingColourGroupScopes } from "@/lib/shopify/scopes";

const MERCHANT_TYPE = "colour_group";
const MERCHANT_NAMESPACE = "custom";
const MERCHANT_KEY = "colour_group";
const APP_TYPE = "$app:colour_group";
const APP_KEY = "colour_group";
const PAGE_SIZE = 100;
const MAX_PAGES = 80;
const METAFIELD_BATCH = 25;
const TITLE_PATTERN = /^(.+?)\s*\(([^)]+)\)\s*$/;

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

type ProductNode = {
  id: string;
  title: string;
  status: string;
  colourGroup: { value: string | null } | null;
  appColourGroup: { value: string | null } | null;
};

type ColourGroupSchema = {
  productsKey: string;
  nameKey: string | null;
};

type ColourGroup = {
  key: string;
  name: string;
  handle: string;
  productIds: string[];
};

export function parseColourTitle(title: string) {
  const match = title.trim().match(TITLE_PATTERN);
  if (!match) return null;
  const baseName = match[1].replace(/\s+/g, " ").trim();
  const colour = match[2].trim();
  if (!baseName || !colour) return null;
  return { baseName, colour };
}

export function colourGroupHandle(key: string) {
  const slug = key
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "group";
}

function groupKey(baseName: string) {
  return baseName.toLocaleLowerCase("en-GB");
}

function handleHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function uniqueHandle(key: string, usedHandles: Map<string, string>) {
  const base = colourGroupHandle(key);
  const owner = usedHandles.get(base);
  if (!owner || owner === key) {
    usedHandles.set(base, key);
    return base;
  }

  for (let serial = 2; serial < 1000; serial += 1) {
    const suffix = serial === 2 ? handleHash(key) : `${handleHash(key)}-${serial}`;
    const trimmed = base.slice(0, Math.max(1, 80 - suffix.length - 1));
    const handle = `${trimmed}-${suffix}`.replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    const taken = usedHandles.get(handle);
    if (!taken || taken === key) {
      usedHandles.set(handle, key);
      return handle;
    }
  }

  throw new Error(`Could not build a unique colour group handle for ${key}.`);
}

export function buildColourGroups(
  products: { id: string; title: string; status: string }[],
) {
  const buckets = new Map<
    string,
    { names: Map<string, number>; productIds: string[]; colours: Set<string> }
  >();

  for (const product of products) {
    if (product.status === "ARCHIVED") continue;
    const parsed = parseColourTitle(product.title);
    if (!parsed) continue;
    const key = groupKey(parsed.baseName);
    const bucket = buckets.get(key) ?? {
      names: new Map<string, number>(),
      productIds: [],
      colours: new Set<string>(),
    };
    bucket.names.set(parsed.baseName, (bucket.names.get(parsed.baseName) ?? 0) + 1);
    bucket.productIds.push(product.id);
    bucket.colours.add(groupKey(parsed.colour));
    buckets.set(key, bucket);
  }

  const usedHandles = new Map<string, string>();
  const groups: ColourGroup[] = [];

  for (const [key, bucket] of buckets) {
    if (bucket.colours.size < 2) continue;
    const name = [...bucket.names.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
    const handle = uniqueHandle(key, usedHandles);
    groups.push({ key, name, handle, productIds: bucket.productIds });
  }

  return groups;
}

export type StoredColourGroup = {
  id: string;
  handle: string;
  name: string;
  productIds: string[];
};

type PlannedGroup = {
  key: string;
  name: string;
  handle: string;
  productIds: string[];
  existingId: string | null;
  productsChanged: boolean;
  nameChanged: boolean;
};

export type ColourGroupPlan = {
  planned: PlannedGroup[];
  created: { name: string; products: string[] }[];
  added: { group: string; product: string }[];
  moved: { product: string; from: string; to: string }[];
  removed: { group: string; product: string }[];
  linked: { group: string; product: string }[];
  removedGroups: { name: string; empty: boolean }[];
};

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const ids = new Set(left);
  return right.every((id) => ids.has(id));
}

function productLabel(id: string, titles: Map<string, string>) {
  return titles.get(id) ?? "A product that is no longer in the catalogue";
}

export function planColourGroupSync(
  existing: StoredColourGroup[],
  desired: ColourGroup[],
  titles: Map<string, string>,
  metafieldByProduct: Map<string, string | null>,
): ColourGroupPlan {
  const existingById = new Map(existing.map((group) => [group.id, group]));
  const unmatched = new Set(existingById.keys());
  const assigned = new Map<string, string | null>();

  const claim = (key: string, id: string) => {
    if (!unmatched.has(id) || assigned.has(key)) return false;
    unmatched.delete(id);
    assigned.set(key, id);
    return true;
  };

  for (const group of desired) {
    const hit = existing.find((item) => unmatched.has(item.id) && item.handle === group.handle);
    if (hit) claim(group.key, hit.id);
  }

  for (const group of desired) {
    if (assigned.has(group.key)) continue;
    const hit = existing.find(
      (item) => unmatched.has(item.id) && groupKey(item.name) === group.key,
    );
    if (hit) claim(group.key, hit.id);
  }

  for (const item of existing) {
    if (!unmatched.has(item.id)) continue;
    const hits = desired.filter(
      (group) =>
        !assigned.has(group.key) &&
        item.productIds.some((id) => group.productIds.includes(id)),
    );
    if (hits.length === 1) claim(hits[0].key, item.id);
  }

  for (const group of desired) {
    if (!assigned.has(group.key)) assigned.set(group.key, null);
  }

  const previousGroup = new Map<string, { id: string; name: string }>();
  for (const group of existing) {
    for (const id of group.productIds) {
      if (!previousGroup.has(id)) previousGroup.set(id, { id: group.id, name: group.name });
    }
  }

  const desiredIds = new Set(desired.flatMap((group) => group.productIds));
  const planned: PlannedGroup[] = [];
  const created: ColourGroupPlan["created"] = [];
  const added: ColourGroupPlan["added"] = [];
  const moved: ColourGroupPlan["moved"] = [];
  const removed: ColourGroupPlan["removed"] = [];
  const linked: ColourGroupPlan["linked"] = [];

  for (const group of desired) {
    const existingId = assigned.get(group.key) ?? null;
    const stored = existingId ? existingById.get(existingId) : undefined;
    planned.push({
      ...group,
      existingId,
      productsChanged: !stored || !sameIds(stored.productIds, group.productIds),
      nameChanged: !stored || stored.name !== group.name,
    });

    if (!stored) {
      created.push({
        name: group.name,
        products: group.productIds.map((id) => productLabel(id, titles)).sort((a, b) => a.localeCompare(b)),
      });
      for (const id of group.productIds) {
        const from = previousGroup.get(id);
        if (!from) continue;
        moved.push({ product: productLabel(id, titles), from: from.name, to: group.name });
      }
      continue;
    }

    const previous = new Set(stored.productIds);
    for (const id of group.productIds) {
      const label = productLabel(id, titles);
      if (!previous.has(id)) {
        const from = previousGroup.get(id);
        if (from && from.id !== stored.id) {
          moved.push({ product: label, from: from.name, to: group.name });
        } else {
          added.push({ group: group.name, product: label });
        }
      } else if (metafieldByProduct.get(id) !== stored.id) {
        linked.push({ group: group.name, product: label });
      }
    }

    for (const id of stored.productIds) {
      if (!group.productIds.includes(id) && !desiredIds.has(id)) {
        removed.push({ group: group.name, product: productLabel(id, titles) });
      }
    }
  }

  const removedGroups = [...unmatched].map((id) => {
    const group = existingById.get(id)!;
    for (const productId of group.productIds) {
      if (!desiredIds.has(productId)) {
        removed.push({ group: group.name, product: productLabel(productId, titles) });
      }
    }
    return { name: group.name, empty: group.productIds.length === 0 };
  });

  const byProduct = (left: { product: string }, right: { product: string }) =>
    left.product.localeCompare(right.product) || JSON.stringify(left).localeCompare(JSON.stringify(right));

  created.sort((a, b) => a.name.localeCompare(b.name));
  added.sort(byProduct);
  moved.sort(byProduct);
  removed.sort(byProduct);
  linked.sort(byProduct);
  removedGroups.sort((a, b) => a.name.localeCompare(b.name));

  return { planned, created, added, moved, removed, linked, removedGroups };
}

function joinNames(names: string[]) {
  const shown = names.slice(0, 8);
  const extra = names.length - shown.length;
  return extra > 0 ? `${shown.join(", ")}, and ${extra} more` : shown.join(", ");
}

function changeLines(lines: string[]) {
  const shown = lines.slice(0, 25);
  const extra = lines.length - shown.length;
  const body = shown.map((line) => `• ${line}`);
  if (extra > 0) body.push(`• and ${extra} more`);
  return body.join("\n");
}

export function formatColourGroupSummary(
  groups: { productIds: string[] }[],
  plan: Pick<ColourGroupPlan, "created" | "added" | "moved" | "removed" | "linked" | "removedGroups">,
  appGroupsRemoved = 0,
) {
  const products = groups.reduce((count, group) => count + group.productIds.length, 0);
  const lines = [`${groups.length} groups, ${products} products`];

  const sections: string[] = [];
  if (plan.created.length) {
    sections.push(
      `Created (${plan.created.length})\n${changeLines(
        plan.created.map((group) =>
          group.products.length ? `${group.name} — ${joinNames(group.products)}` : group.name,
        ),
      )}`,
    );
  }
  if (plan.added.length) {
    sections.push(
      `Added (${plan.added.length})\n${changeLines(
        plan.added.map((item) => `${item.product} → ${item.group}`),
      )}`,
    );
  }
  if (plan.moved.length) {
    sections.push(
      `Moved (${plan.moved.length})\n${changeLines(
        plan.moved.map((item) => `${item.product} from ${item.from} to ${item.to}`),
      )}`,
    );
  }
  if (plan.removed.length) {
    sections.push(
      `Removed (${plan.removed.length})\n${changeLines(
        plan.removed.map((item) => `${item.product} from ${item.group}`),
      )}`,
    );
  }
  if (plan.removedGroups.length) {
    sections.push(
      `Removed groups (${plan.removedGroups.length})\n${changeLines(
        plan.removedGroups.map((group) => (group.empty ? `${group.name} (empty)` : group.name)),
      )}`,
    );
  }
  if (plan.linked.length) {
    sections.push(
      `Linked (${plan.linked.length})\n${changeLines(
        plan.linked.map((item) => `${item.product} → ${item.group}`),
      )}`,
    );
  }
  if (appGroupsRemoved > 0) {
    sections.push(
      `Removed ${appGroupsRemoved} extra groups saved beside the store colour groups. The theme does not read those.`,
    );
  }

  if (!sections.length) {
    sections.push("No groups created. No products added or removed.");
  }

  return [...lines, ...sections].join("\n\n");
}

function metaobjectGid(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim().replace(/^"|"$/g, "");
  return trimmed.startsWith("gid://shopify/Metaobject/") ? trimmed : null;
}

async function admin<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let lastErrors: GraphQlError[] | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result: GraphQlResponse<T> = await shopifyGraphql<T>(
      shop,
      accessToken,
      query,
      variables,
    );
    const throttled = (result.errors ?? []).some(
      (error) => error.extensions?.code?.toUpperCase() === "THROTTLED",
    );
    if (throttled && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      lastErrors = result.errors;
      continue;
    }
    if (result.errors?.length) {
      if (isAccessDenied(result.errors)) {
        throw new Error(
          "Shopify refused this request. Reconnect the store so the token includes product and metaobject access.",
        );
      }
      throw new Error(result.errors.map((error) => error.message).join(" "));
    }
    if (!result.data) {
      throw new Error("Shopify returned an empty response.");
    }
    return result.data;
  }
  throw new Error(lastErrors?.map((error) => error.message).join(" ") || "Shopify throttled the request.");
}

function assertUserErrors(
  errors: { field?: string[] | null; message: string; code?: string }[] | undefined,
) {
  if (!errors?.length) return;
  const taken = errors.every(
    (error) => error.code === "TAKEN" || /already been taken|already exists/i.test(error.message),
  );
  if (taken) return "taken" as const;
  throw new Error(errors.map((error) => error.message).join(" "));
}

function assertFieldKey(key: string) {
  if (!/^[A-Za-z0-9_]+$/.test(key)) {
    throw new Error(`Unexpected colour group field name: ${key}`);
  }
  return key;
}

async function resolveColourGroupSchema(shop: string, accessToken: string): Promise<ColourGroupSchema> {
  const existing = await admin<{
    metaobjectDefinitionByType: {
      id: string;
      displayNameKey: string | null;
      fieldDefinitions: { key: string; type: { name: string } }[];
    } | null;
    metafieldDefinitions: { nodes: { id: string; type: { name: string } }[] };
  }>(
    shop,
    accessToken,
    /* GraphQL */ `
      query ColourGroupDefinitions {
        metaobjectDefinitionByType(type: "${MERCHANT_TYPE}") {
          id
          displayNameKey
          fieldDefinitions {
            key
            type {
              name
            }
          }
        }
        metafieldDefinitions(
          first: 1
          ownerType: PRODUCT
          namespace: "${MERCHANT_NAMESPACE}"
          key: "${MERCHANT_KEY}"
        ) {
          nodes {
            id
            type {
              name
            }
          }
        }
      }
    `,
  );

  const definition = existing.metaobjectDefinitionByType;
  if (!definition) {
    throw new Error(
      "This store has no colour_group metaobject. The theme reads groups from that metaobject and the custom.colour_group product field.",
    );
  }

  const productFields = definition.fieldDefinitions.filter(
    (field) => field.type.name === "list.product_reference",
  );
  const productsField =
    productFields.find((field) => field.key === "products") ?? productFields[0];
  if (!productsField) {
    throw new Error("The colour_group metaobject has no product list, so groups cannot be updated.");
  }

  const textFields = definition.fieldDefinitions.filter(
    (field) => field.type.name === "single_line_text_field",
  );
  const nameField =
    textFields.find((field) => field.key === definition.displayNameKey) ??
    textFields.find((field) => field.key === "name") ??
    null;

  const metafield = existing.metafieldDefinitions.nodes[0];
  if (metafield && metafield.type.name !== "metaobject_reference") {
    throw new Error(
      "The custom.colour_group product field is not a colour group reference, so the theme cannot read these groups.",
    );
  }

  if (!metafield) {
    const created = await admin<{
      metafieldDefinitionCreate: {
        userErrors: { field?: string[] | null; message: string; code?: string }[];
      };
    }>(
      shop,
      accessToken,
      /* GraphQL */ `
        mutation ColourGroupMetafield($definitionId: String!) {
          metafieldDefinitionCreate(
            definition: {
              name: "Colour group"
              namespace: "${MERCHANT_NAMESPACE}"
              key: "${MERCHANT_KEY}"
              description: "Colour-variant group for this product."
              type: "metaobject_reference"
              ownerType: PRODUCT
              access: { admin: MERCHANT_READ, storefront: PUBLIC_READ }
              validations: [{ name: "metaobject_definition_id", value: $definitionId }]
            }
          ) {
            createdDefinition {
              id
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `,
      { definitionId: definition.id },
    );
    assertUserErrors(created.metafieldDefinitionCreate.userErrors);
  }

  return {
    productsKey: assertFieldKey(productsField.key),
    nameKey: nameField ? assertFieldKey(nameField.key) : null,
  };
}

async function fetchProducts(shop: string, accessToken: string) {
  const products: ProductNode[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data: {
      products: { pageInfo: PageInfo; nodes: ProductNode[] };
    } = await admin(
      shop,
      accessToken,
      /* GraphQL */ `
        query ColourGroupProducts($cursor: String) {
          products(
            first: ${PAGE_SIZE}
            after: $cursor
            query: "status:active OR status:draft OR status:archived"
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              status
              colourGroup: metafield(namespace: "${MERCHANT_NAMESPACE}", key: "${MERCHANT_KEY}") {
                value
              }
              appColourGroup: metafield(key: "${APP_KEY}") {
                value
              }
            }
          }
        }
      `,
      { cursor },
    );
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) return products;
    cursor = data.products.pageInfo.endCursor;
    if (!cursor) throw new Error("Shopify product pagination did not return a cursor.");
  }

  throw new Error("This catalogue is larger than one colour-grouping run can read.");
}

function productIdsFromValue(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is string => typeof id === "string" && id.startsWith("gid://shopify/Product/"),
    );
  } catch {
    return [];
  }
}

async function fetchMetaobjects(shop: string, accessToken: string, schema: ColourGroupSchema) {
  const metaobjects: StoredColourGroup[] = [];
  let cursor: string | null = null;
  const nameSelection = schema.nameKey
    ? `name: field(key: "${schema.nameKey}") { value }`
    : "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data: {
      metaobjects: {
        pageInfo: PageInfo;
        nodes: {
          id: string;
          handle: string;
          displayName: string;
          name?: { value: string | null } | null;
          products: { value: string | null } | null;
        }[];
      };
    } = await admin(
      shop,
      accessToken,
      /* GraphQL */ `
        query ExistingColourGroups($cursor: String) {
          metaobjects(type: "${MERCHANT_TYPE}", first: ${PAGE_SIZE}, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              handle
              displayName
              ${nameSelection}
              products: field(key: "${schema.productsKey}") {
                value
              }
            }
          }
        }
      `,
      { cursor },
    );
    for (const node of data.metaobjects.nodes) {
      const named = node.name?.value?.trim() || node.displayName.trim();
      metaobjects.push({
        id: node.id,
        handle: node.handle,
        name: named || node.handle,
        productIds: productIdsFromValue(node.products?.value),
      });
    }
    if (!data.metaobjects.pageInfo.hasNextPage) return metaobjects;
    cursor = data.metaobjects.pageInfo.endCursor;
    if (!cursor) throw new Error("Shopify metaobject pagination did not return a cursor.");
  }

  throw new Error("There are more colour groups than one run can read.");
}

function groupFields(
  schema: ColourGroupSchema,
  group: { name: string; productIds: string[] },
  includeName: boolean,
) {
  const fields: { key: string; value: string }[] = [];
  if (includeName && schema.nameKey) {
    fields.push({ key: schema.nameKey, value: group.name });
  }
  fields.push({ key: schema.productsKey, value: JSON.stringify(group.productIds) });
  return fields;
}

async function upsertGroup(
  shop: string,
  accessToken: string,
  schema: ColourGroupSchema,
  group: ColourGroup,
) {
  const data = await admin<{
    metaobjectUpsert: {
      metaobject: { id: string; handle: string } | null;
      userErrors: { message: string; code?: string }[];
    };
  }>(
    shop,
    accessToken,
    /* GraphQL */ `
      mutation UpsertColourGroup($handle: String!, $fields: [MetaobjectFieldInput!]!) {
        metaobjectUpsert(
          handle: { type: "${MERCHANT_TYPE}", handle: $handle }
          metaobject: { fields: $fields }
        ) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    {
      handle: group.handle,
      fields: groupFields(schema, group, true),
    },
  );
  assertUserErrors(data.metaobjectUpsert.userErrors);
  const id = data.metaobjectUpsert.metaobject?.id;
  if (!id) throw new Error(`Shopify did not return a colour group for ${group.name}.`);
  return id;
}

async function updateGroup(
  shop: string,
  accessToken: string,
  schema: ColourGroupSchema,
  id: string,
  group: { name: string; productIds: string[] },
  includeName: boolean,
) {
  const data = await admin<{
    metaobjectUpdate: {
      metaobject: { id: string } | null;
      userErrors: { message: string; code?: string }[];
    };
  }>(
    shop,
    accessToken,
    /* GraphQL */ `
      mutation UpdateColourGroup($id: ID!, $fields: [MetaobjectFieldInput!]!) {
        metaobjectUpdate(id: $id, metaobject: { fields: $fields }) {
          metaobject {
            id
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    { id, fields: groupFields(schema, group, includeName) },
  );
  assertUserErrors(data.metaobjectUpdate.userErrors);
  if (!data.metaobjectUpdate.metaobject?.id) {
    throw new Error(`Shopify did not update the colour group ${group.name}.`);
  }
}

async function setMetafields(
  shop: string,
  accessToken: string,
  metafields: { ownerId: string; namespace: string; key: string; type: string; value: string }[],
) {
  for (let index = 0; index < metafields.length; index += METAFIELD_BATCH) {
    const batch = metafields.slice(index, index + METAFIELD_BATCH);
    const data = await admin<{
      metafieldsSet: { userErrors: { message: string; code?: string }[] };
    }>(
      shop,
      accessToken,
      /* GraphQL */ `
        mutation SetColourGroupMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `,
      { metafields: batch },
    );
    assertUserErrors(data.metafieldsSet.userErrors);
  }
}

async function clearMetafields(
  shop: string,
  accessToken: string,
  ownerIds: string[],
  namespace: string,
  key: string,
) {
  for (let index = 0; index < ownerIds.length; index += METAFIELD_BATCH) {
    const batch = ownerIds.slice(index, index + METAFIELD_BATCH).map((ownerId) => ({
      ownerId,
      namespace,
      key,
    }));
    const data = await admin<{
      metafieldsDelete: { userErrors: { message: string }[] };
    }>(
      shop,
      accessToken,
      /* GraphQL */ `
        mutation ClearColourGroupMetafields($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            deletedMetafields {
              key
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      { metafields: batch },
    );
    assertUserErrors(data.metafieldsDelete.userErrors);
  }
}

async function deleteMetaobject(shop: string, accessToken: string, id: string) {
  const data = await admin<{
    metaobjectDelete: { userErrors: { message: string; code?: string }[] };
  }>(
    shop,
    accessToken,
    /* GraphQL */ `
      mutation DeleteColourGroup($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    { id },
  );
  assertUserErrors(data.metaobjectDelete.userErrors);
}

async function removeLegacyAppGroups(
  shop: string,
  accessToken: string,
  products: ProductNode[],
) {
  const ownerIds = products
    .map((product) => (metaobjectGid(product.appColourGroup?.value) ? product.id : null))
    .filter((id): id is string => Boolean(id));
  await clearMetafields(shop, accessToken, ownerIds, "$app", APP_KEY);

  const ids: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data: {
      metaobjects: { pageInfo: PageInfo; nodes: { id: string }[] };
    } = await admin(
      shop,
      accessToken,
      /* GraphQL */ `
        query LegacyColourGroups($cursor: String) {
          metaobjects(type: "${APP_TYPE}", first: ${PAGE_SIZE}, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
            }
          }
        }
      `,
      { cursor },
    );
    ids.push(...data.metaobjects.nodes.map((node) => node.id));
    if (!data.metaobjects.pageInfo.hasNextPage) break;
    cursor = data.metaobjects.pageInfo.endCursor;
    if (!cursor) throw new Error("Shopify metaobject pagination did not return a cursor.");
    if (page === MAX_PAGES - 1) {
      throw new Error("There are more colour groups than one run can read.");
    }
  }

  for (const id of ids) {
    await deleteMetaobject(shop, accessToken, id);
  }
  return ids.length;
}

export async function syncProjectColourGroups(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<{ ok: true; summary: string } | { error: string }> {
  const { data, error } = await supabase
    .from("project_shopify_connections")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) return { error: error.message };
  const row = data as ProjectShopifyConnection | null;
  if (!row?.access_token_ciphertext || row.status !== "connected") {
    return { error: "Connect the Shopify store before grouping products." };
  }
  if (!row.colour_grouping_enabled) {
    return { error: "Colour grouping is turned off for this store." };
  }

  const missing = missingColourGroupScopes(row.scopes);
  if (missing.length) {
    const message =
      "Reconnect the store. Colour grouping needs write_products, write_metaobjects, and write_metaobject_definitions on the current token.";
    await supabase
      .from("project_shopify_connections")
      .update({ colour_grouping_last_error: message })
      .eq("project_id", projectId);
    return { error: message };
  }

  let accessToken: string;
  try {
    accessToken = decryptSecret(row.access_token_ciphertext);
  } catch {
    return { error: "Could not read the stored Shopify token. Reconnect the store." };
  }

  try {
    const schema = await resolveColourGroupSchema(row.shop_domain, accessToken);
    const products = await fetchProducts(row.shop_domain, accessToken);
    const existing = await fetchMetaobjects(row.shop_domain, accessToken, schema);
    const groups = buildColourGroups(products);
    const titles = new Map(products.map((product) => [product.id, product.title]));
    const metafieldByProduct = new Map(
      products.map((product) => [product.id, metaobjectGid(product.colourGroup?.value)]),
    );
    const plan = planColourGroupSync(existing, groups, titles, metafieldByProduct);
    const groupIdByKey = new Map<string, string>();

    for (const group of plan.planned) {
      const writeName = Boolean(schema.nameKey) && group.nameChanged;
      if (group.existingId && !group.productsChanged && !writeName) {
        groupIdByKey.set(group.key, group.existingId);
        continue;
      }
      if (group.existingId) {
        await updateGroup(row.shop_domain, accessToken, schema, group.existingId, group, writeName);
        groupIdByKey.set(group.key, group.existingId);
      } else {
        const id = await upsertGroup(row.shop_domain, accessToken, schema, group);
        groupIdByKey.set(group.key, id);
      }
    }

    const productGroupId = new Map<string, string>();
    for (const group of plan.planned) {
      const id = groupIdByKey.get(group.key);
      if (!id) continue;
      for (const productId of group.productIds) productGroupId.set(productId, id);
    }

    const toSet: { ownerId: string; namespace: string; key: string; type: string; value: string }[] = [];
    const toClear: string[] = [];
    for (const product of products) {
      const desired = productGroupId.get(product.id) ?? null;
      const current = metaobjectGid(product.colourGroup?.value);
      if (desired && desired !== current) {
        toSet.push({
          ownerId: product.id,
          namespace: MERCHANT_NAMESPACE,
          key: MERCHANT_KEY,
          type: "metaobject_reference",
          value: desired,
        });
      } else if (!desired && current) {
        toClear.push(product.id);
      }
    }

    await setMetafields(row.shop_domain, accessToken, toSet);
    await clearMetafields(row.shop_domain, accessToken, toClear, MERCHANT_NAMESPACE, MERCHANT_KEY);

    const kept = new Set(groupIdByKey.values());
    for (const metaobject of existing) {
      if (kept.has(metaobject.id)) continue;
      await deleteMetaobject(row.shop_domain, accessToken, metaobject.id);
    }

    let appGroupsRemoved = 0;
    try {
      appGroupsRemoved = await removeLegacyAppGroups(row.shop_domain, accessToken, products);
    } catch (cleanupError) {
      const cleanupMessage =
        cleanupError instanceof Error ? cleanupError.message : "Could not remove the extra groups.";
      if (/does not exist|no metaobject definition|unknown type/i.test(cleanupMessage)) {
        appGroupsRemoved = 0;
      } else {
        const summary = `${formatColourGroupSummary(groups, plan, 0)}\n\nThe store groups were updated. Extra groups saved beside them could not be removed: ${cleanupMessage}`;
        await supabase
          .from("project_shopify_connections")
          .update({
            colour_grouping_last_run_at: new Date().toISOString(),
            colour_grouping_last_error: null,
            colour_grouping_last_summary: summary,
          })
          .eq("project_id", projectId);
        return { ok: true, summary };
      }
    }

    const summary = formatColourGroupSummary(groups, plan, appGroupsRemoved);
    await supabase
      .from("project_shopify_connections")
      .update({
        colour_grouping_last_run_at: new Date().toISOString(),
        colour_grouping_last_error: null,
        colour_grouping_last_summary: summary,
      })
      .eq("project_id", projectId);

    return { ok: true, summary };
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Could not group colour products.";
    await supabase
      .from("project_shopify_connections")
      .update({ colour_grouping_last_error: message })
      .eq("project_id", projectId);
    return { error: message };
  }
}

export type ColourGroupMemberList = {
  name: string;
  products: string[];
  truncated?: boolean;
};

export async function listProjectColourGroups(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<{ error: string } | { groups: ColourGroupMemberList[] }> {
  const { data, error } = await supabase
    .from("project_shopify_connections")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) return { error: error.message };
  const row = data as ProjectShopifyConnection | null;
  if (!row?.access_token_ciphertext || row.status !== "connected") {
    return { error: "Connect the Shopify store before viewing colour groups." };
  }
  if (missingColourGroupScopes(row.scopes).length) {
    return { error: "Reconnect the store before viewing colour groups." };
  }

  let accessToken: string;
  try {
    accessToken = decryptSecret(row.access_token_ciphertext);
  } catch {
    return { error: "Could not read the stored Shopify token. Reconnect the store." };
  }

  const schema = await resolveColourGroupSchema(row.shop_domain, accessToken);
  const groups: ColourGroupMemberList[] = [];
  let cursor: string | null = null;
  const nameSelection = schema.nameKey
    ? `name: field(key: "${schema.nameKey}") { value }`
    : "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const dataPage: {
      metaobjects: {
        pageInfo: PageInfo;
        nodes: {
          handle: string;
          displayName: string;
          name?: { value: string | null } | null;
          products: {
            references: {
              nodes: { title?: string }[];
              pageInfo: { hasNextPage: boolean };
            } | null;
          } | null;
        }[];
      };
    } = await admin(
      row.shop_domain,
      accessToken,
      /* GraphQL */ `
        query ColourGroupReview($cursor: String) {
          metaobjects(type: "${MERCHANT_TYPE}", first: 25, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              handle
              displayName
              ${nameSelection}
              products: field(key: "${schema.productsKey}") {
                references(first: 100) {
                  nodes {
                    ... on Product {
                      title
                    }
                  }
                  pageInfo {
                    hasNextPage
                  }
                }
              }
            }
          }
        }
      `,
      { cursor },
    );

    for (const node of dataPage.metaobjects.nodes) {
      const products = (node.products?.references?.nodes ?? [])
        .map((product) => product.title?.trim() ?? "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      groups.push({
        name: node.name?.value?.trim() || node.displayName.trim() || node.handle,
        products,
        truncated: Boolean(node.products?.references?.pageInfo.hasNextPage),
      });
    }

    if (!dataPage.metaobjects.pageInfo.hasNextPage) {
      groups.sort((a, b) => a.name.localeCompare(b.name));
      return { groups };
    }
    cursor = dataPage.metaobjects.pageInfo.endCursor;
    if (!cursor) throw new Error("Shopify metaobject pagination did not return a cursor.");
  }

  throw new Error("There are more colour groups than this page can list.");
}

export async function syncScheduledColourGroups(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase
    .from("project_shopify_connections")
    .select("project_id")
    .eq("status", "connected")
    .eq("colour_grouping_enabled", true);

  if (error) return { error: error.message };

  const results: {
    projectId: string;
    status: "grouped" | "error";
    summary?: string;
    error?: string;
  }[] = [];

  for (const connection of data ?? []) {
    const result = await syncProjectColourGroups(supabase, connection.project_id);
    if ("error" in result) {
      results.push({
        projectId: connection.project_id,
        status: "error",
        error: result.error,
      });
    } else {
      results.push({
        projectId: connection.project_id,
        status: "grouped",
        summary: result.summary,
      });
    }
  }

  return { ok: true, results };
}
