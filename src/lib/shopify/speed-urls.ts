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

type UrlPayload = {
  shop?: { primaryDomain?: { url?: string | null } | null } | null;
  collections?: {
    nodes?: {
      title?: string | null;
      onlineStoreUrl?: string | null;
    }[];
  } | null;
  products?: {
    nodes?: {
      title?: string | null;
      status?: string | null;
      onlineStoreUrl?: string | null;
      featuredMedia?: { id?: string | null } | null;
    }[];
  } | null;
};

const URLS_QUERY = /* GraphQL */ `
  query StoreSpeedUrls {
    shop {
      primaryDomain {
        url
      }
    }
    collections(first: 20, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        title
        onlineStoreUrl
      }
    }
    products(first: 20, query: "status:active", sortKey: BEST_SELLING) {
      nodes {
        title
        status
        onlineStoreUrl
        featuredMedia {
          id
        }
      }
    }
  }
`;

function originFrom(url: string) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function joinUrl(origin: string, path: string) {
  return `${origin.replace(/\/$/, "")}${path}`;
}

async function firstProductFromSitemap(origin: string) {
  const sitemapUrl = joinUrl(origin, "/sitemap_products_1.xml");
  const response = await fetch(sitemapUrl, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "application/xml,text/xml" },
  });
  if (!response.ok) return null;
  const xml = await response.text();
  const match = xml.match(/<loc>\s*(https?:\/\/[^<]+\/products\/[^<]+)\s*<\/loc>/i);
  return match?.[1]?.trim() ?? null;
}

export async function resolveSpeedTargets(
  shop: string,
  accessToken: string,
  fallbackOrigin?: string | null,
): Promise<{ origin: string; targets: SpeedTarget[] }> {
  let result: GraphQlResponse<UrlPayload> = {};
  try {
    result = await shopifyGraphql<UrlPayload>(shop, accessToken, URLS_QUERY);
  } catch {
    result = {};
  }

  const accessDenied = isAccessDenied(result.errors);
  const shopUrl =
    result.data?.shop?.primaryDomain?.url ??
    fallbackOrigin ??
    `https://${shop}`;
  const origin = originFrom(shopUrl);

  let collectionUrl: string | null = null;
  let collectionTitle = "Collection";
  let productUrl: string | null = null;
  let productTitle = "Product";

  if (!accessDenied) {
    const collection = (result.data?.collections?.nodes ?? []).find(
      (node) => node.onlineStoreUrl,
    );
    if (collection?.onlineStoreUrl) {
      collectionUrl = collection.onlineStoreUrl;
      collectionTitle = collection.title?.trim() || "Collection";
    }

    const product = (result.data?.products?.nodes ?? []).find(
      (node) =>
        node.status === "ACTIVE" &&
        node.onlineStoreUrl &&
        node.featuredMedia,
    ) ?? (result.data?.products?.nodes ?? []).find((node) => node.onlineStoreUrl);
    if (product?.onlineStoreUrl) {
      productUrl = product.onlineStoreUrl;
      productTitle = product.title?.trim() || "Product";
    }
  }

  if (!collectionUrl) {
    collectionUrl = joinUrl(origin, "/collections/all");
    collectionTitle = "All products";
  }
  if (!productUrl) {
    productUrl = await firstProductFromSitemap(origin);
  }

  const targets: SpeedTarget[] = [
    { page_kind: "home", url: origin, title: "Homepage" },
    { page_kind: "collection", url: collectionUrl, title: collectionTitle },
    {
      page_kind: "cart",
      url: joinUrl(origin, "/cart"),
      title: "Cart",
    },
  ];
  if (productUrl) {
    targets.splice(2, 0, {
      page_kind: "product",
      url: productUrl,
      title: productTitle,
    });
  }

  return { origin, targets };
}
