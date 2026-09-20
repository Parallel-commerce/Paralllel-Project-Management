import {
  isAccessDenied,
  shopifyGraphql,
  type GraphQlResponse,
} from "@/lib/shopify/admin";
import type { SpeedPageKind } from "@/lib/pagespeed";

export type SpeedTarget = {
  page_kind: SpeedPageKind;
  url: string;
  title: string;
};

type ShopPayload = {
  shop?: { primaryDomain?: { url?: string | null } | null } | null;
};

const SHOP_URL_QUERY = /* GraphQL */ `
  query StoreSpeedShopUrl {
    shop {
      primaryDomain {
        url
      }
    }
  }
`;

const SKIP_COLLECTION = /(^|\/)(all|all-products|frontpage|gift-card|gift-cards)\/?$/i;
const SKIP_PRODUCT = /(gift-card|giftcard)s?(\/|$)/i;
const PREFERRED_COLLECTION = /(new-arrivals|new-in|best-sellers|bestsellers|featured)/i;

function originFrom(url: string) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function joinUrl(origin: string, path: string) {
  return `${origin.replace(/\/$/, "")}${path}`;
}

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .trim();
}

function titleFromHandle(url: string) {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "");
    const handle = path.split("/").filter(Boolean).pop() ?? "Page";
    return handle
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "Page";
  }
}

async function fetchXml(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      Accept: "application/xml,text/xml",
      "User-Agent": "ParallelStoreSpeed/1.0",
    },
  });
  if (!response.ok) return "";
  return response.text();
}

function xmlLocs(xml: string) {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) =>
    decodeXml(match[1] ?? ""),
  );
}

function xmlUrlBlocks(xml: string) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((match) => {
    const block = match[1] ?? "";
    const loc = decodeXml(block.match(/<loc>\s*([^<]+)\s*<\/loc>/i)?.[1] ?? "");
    const imageTitle = decodeXml(
      block.match(/<image:title>\s*([^<]+)\s*<\/image:title>/i)?.[1] ?? "",
    );
    return { loc, imageTitle };
  });
}

async function sitemapTargets(origin: string) {
  const indexXml = await fetchXml(joinUrl(origin, "/sitemap.xml"));
  const childSitemaps = xmlLocs(indexXml);
  const collectionSitemap =
    childSitemaps.find((url) => url.includes("sitemap_collections")) ??
    joinUrl(origin, "/sitemap_collections_1.xml");
  const productSitemap =
    childSitemaps.find(
      (url) => url.includes("sitemap_products") && !url.includes("/en-"),
    ) ?? joinUrl(origin, "/sitemap_products_1.xml");

  const collectionBlocks = xmlUrlBlocks(await fetchXml(collectionSitemap));
  const productBlocks = xmlUrlBlocks(await fetchXml(productSitemap));

  const collections = collectionBlocks.filter(
    (item) => item.loc.includes("/collections/") && !SKIP_COLLECTION.test(item.loc),
  );
  const preferred =
    collections.find((item) => PREFERRED_COLLECTION.test(item.loc)) ??
    collections[0];

  const products = productBlocks.filter(
    (item) => item.loc.includes("/products/") && !SKIP_PRODUCT.test(item.loc),
  );

  return {
    collection: preferred
      ? {
          url: preferred.loc,
          title: preferred.imageTitle || titleFromHandle(preferred.loc),
        }
      : null,
    product: products[0]
      ? {
          url: products[0].loc,
          title: products[0].imageTitle || titleFromHandle(products[0].loc),
        }
      : null,
  };
}

export async function resolveSpeedTargets(
  shop: string,
  accessToken: string,
  fallbackOrigin?: string | null,
): Promise<{ origin: string; targets: SpeedTarget[] }> {
  let shopUrl = fallbackOrigin ?? `https://${shop}`;
  try {
    const result: GraphQlResponse<ShopPayload> = await shopifyGraphql<ShopPayload>(
      shop,
      accessToken,
      SHOP_URL_QUERY,
    );
    if (!isAccessDenied(result.errors) && result.data?.shop?.primaryDomain?.url) {
      shopUrl = result.data.shop.primaryDomain.url;
    }
  } catch {
    // Use the custom domain from the latest snapshot when Admin is unavailable.
  }

  const origin = originFrom(shopUrl);
  const fromSitemap = await sitemapTargets(origin).catch(() => ({
    collection: null,
    product: null,
  }));

  const collection = fromSitemap.collection ?? {
    url: joinUrl(origin, "/collections/all"),
    title: "All products",
  };
  const product = fromSitemap.product;

  const targets: SpeedTarget[] = [
    { page_kind: "home", url: origin, title: "Homepage" },
    {
      page_kind: "collection",
      url: collection.url,
      title: collection.title,
    },
  ];
  if (product) {
    targets.push({
      page_kind: "product",
      url: product.url,
      title: product.title,
    });
  }
  targets.push({
    page_kind: "cart",
    url: joinUrl(origin, "/cart"),
    title: "Cart",
  });

  return { origin, targets };
}
