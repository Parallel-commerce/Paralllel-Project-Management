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

const COLOUR_GROUP_TYPE = "$app:colour_group";
const COLOUR_GROUP_KEY = "colour_group";
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

export function buildColourGroups(
  products: { id: string; title: string; status: string }[],
) {
  const buckets = new Map<string, { names: Map<string, number>; productIds: string[] }>();

  for (const product of products) {
    if (product.status === "ARCHIVED") continue;
    const parsed = parseColourTitle(product.title);
    if (!parsed) continue;
    const key = groupKey(parsed.baseName);
    const bucket = buckets.get(key) ?? { names: new Map<string, number>(), productIds: [] };
    bucket.names.set(parsed.baseName, (bucket.names.get(parsed.baseName) ?? 0) + 1);
    bucket.productIds.push(product.id);
    buckets.set(key, bucket);
  }

  const usedHandles = new Map<string, string>();
  const groups: ColourGroup[] = [];

  for (const [key, bucket] of buckets) {
    const name = [...bucket.names.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
    let handle = colourGroupHandle(key);
    const owner = usedHandles.get(handle);
    if (owner && owner !== key) {
      handle = `${handle}-${handleHash(key)}`.slice(0, 80);
    }
    usedHandles.set(handle, key);
    groups.push({ key, name, handle, productIds: bucket.productIds });
  }

  return groups;
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

async function ensureDefinitions(shop: string, accessToken: string) {
  const existing = await admin<{
    metaobjectDefinitionByType: { id: string } | null;
    metafieldDefinitions: { nodes: { id: string }[] };
  }>(
    shop,
    accessToken,
    /* GraphQL */ `
      query ColourGroupDefinitions {
        metaobjectDefinitionByType(type: "${COLOUR_GROUP_TYPE}") {
          id
        }
        metafieldDefinitions(
          first: 1
          ownerType: PRODUCT
          namespace: "$app"
          key: "${COLOUR_GROUP_KEY}"
        ) {
          nodes {
            id
          }
        }
      }
    `,
  );

  let definitionId = existing.metaobjectDefinitionByType?.id ?? null;

  if (!definitionId) {
    const created = await admin<{
      metaobjectDefinitionCreate: {
        metaobjectDefinition: { id: string } | null;
        userErrors: { field?: string[] | null; message: string; code?: string }[];
      };
    }>(
      shop,
      accessToken,
      /* GraphQL */ `
        mutation ColourGroupDefinition {
          metaobjectDefinitionCreate(
            definition: {
              type: "${COLOUR_GROUP_TYPE}"
              name: "Colour group"
              description: "Products that are colour variants of the same item."
              displayNameKey: "name"
              access: { admin: MERCHANT_READ, storefront: PUBLIC_READ }
              fieldDefinitions: [
                { key: "name", name: "Name", type: "single_line_text_field", required: true }
                { key: "products", name: "Products", type: "list.product_reference" }
              ]
            }
          ) {
            metaobjectDefinition {
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
    );
    assertUserErrors(created.metaobjectDefinitionCreate.userErrors);
    definitionId = created.metaobjectDefinitionCreate.metaobjectDefinition?.id ?? null;
  }

  if (!definitionId) {
    throw new Error("Shopify did not return the colour group definition.");
  }

  if (!existing.metafieldDefinitions.nodes.length) {
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
              namespace: "$app"
              key: "${COLOUR_GROUP_KEY}"
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
      { definitionId },
    );
    assertUserErrors(created.metafieldDefinitionCreate.userErrors);
  }
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
              colourGroup: metafield(key: "${COLOUR_GROUP_KEY}") {
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

async function fetchMetaobjects(shop: string, accessToken: string) {
  const metaobjects: { id: string; handle: string }[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data: {
      metaobjects: { pageInfo: PageInfo; nodes: { id: string; handle: string }[] };
    } = await admin(
      shop,
      accessToken,
      /* GraphQL */ `
        query ExistingColourGroups($cursor: String) {
          metaobjects(type: "${COLOUR_GROUP_TYPE}", first: ${PAGE_SIZE}, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              handle
            }
          }
        }
      `,
      { cursor },
    );
    metaobjects.push(...data.metaobjects.nodes);
    if (!data.metaobjects.pageInfo.hasNextPage) return metaobjects;
    cursor = data.metaobjects.pageInfo.endCursor;
    if (!cursor) throw new Error("Shopify metaobject pagination did not return a cursor.");
  }

  throw new Error("There are more colour groups than one run can read.");
}

async function upsertGroup(
  shop: string,
  accessToken: string,
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
      mutation UpsertColourGroup($handle: String!, $name: String!, $products: String!) {
        metaobjectUpsert(
          handle: { type: "${COLOUR_GROUP_TYPE}", handle: $handle }
          metaobject: {
            fields: [
              { key: "name", value: $name }
              { key: "products", value: $products }
            ]
          }
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
      name: group.name,
      products: JSON.stringify(group.productIds),
    },
  );
  assertUserErrors(data.metaobjectUpsert.userErrors);
  const id = data.metaobjectUpsert.metaobject?.id;
  if (!id) throw new Error(`Shopify did not return a colour group for ${group.name}.`);
  return id;
}

async function setMetafields(
  shop: string,
  accessToken: string,
  metafields: { ownerId: string; key: string; value: string }[],
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
) {
  for (let index = 0; index < ownerIds.length; index += METAFIELD_BATCH) {
    const batch = ownerIds.slice(index, index + METAFIELD_BATCH).map((ownerId) => ({
      ownerId,
      namespace: "$app",
      key: COLOUR_GROUP_KEY,
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

function summarize(groups: ColourGroup[], unlinked: number) {
  const products = groups.reduce((count, group) => count + group.productIds.length, 0);
  const summary = `${groups.length} groups, ${products} products`;
  return unlinked ? `${summary}, ${unlinked} unlinked` : summary;
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
    await ensureDefinitions(row.shop_domain, accessToken);
    const products = await fetchProducts(row.shop_domain, accessToken);
    const existing = await fetchMetaobjects(row.shop_domain, accessToken);
    const groups = buildColourGroups(products);
    const groupIdByHandle = new Map<string, string>();

    for (const group of groups) {
      const id = await upsertGroup(row.shop_domain, accessToken, group);
      groupIdByHandle.set(group.handle, id);
    }

    const productGroupId = new Map<string, string>();
    for (const group of groups) {
      const id = groupIdByHandle.get(group.handle);
      if (!id) continue;
      for (const productId of group.productIds) productGroupId.set(productId, id);
    }

    const toSet: { ownerId: string; key: string; value: string }[] = [];
    const toClear: string[] = [];
    for (const product of products) {
      const desired = productGroupId.get(product.id) ?? null;
      const current = metaobjectGid(product.colourGroup?.value);
      if (desired && desired !== current) {
        toSet.push({ ownerId: product.id, key: COLOUR_GROUP_KEY, value: desired });
      } else if (!desired && current) {
        toClear.push(product.id);
      }
    }

    await setMetafields(row.shop_domain, accessToken, toSet);
    await clearMetafields(row.shop_domain, accessToken, toClear);

    const keepIds = new Set(groupIdByHandle.values());
    for (const metaobject of existing) {
      if (!keepIds.has(metaobject.id)) {
        await deleteMetaobject(row.shop_domain, accessToken, metaobject.id);
      }
    }

    const summary = summarize(groups, toClear.length);
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
