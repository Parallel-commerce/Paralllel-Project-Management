import { lastCompleteLocalDay } from "@/lib/store-report";
import { shopAdminOrigin } from "@/lib/shopify/domain";
import { fetchSnapshotTraffic } from "@/lib/shopify/sessions";

export const SHOPIFY_API_VERSION = "2026-04";

export type GraphQlError = {
  message: string;
  extensions?: { code?: string };
};

export type GraphQlResponse<T> = {
  data?: T;
  errors?: GraphQlError[];
};

type OrdersPage = {
  orders?: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      currentTotalPriceSet?: {
        shopMoney?: { amount?: string; currencyCode?: string };
      };
    }[];
  };
};

export type StoreSnapshotData = {
  shopName: string | null;
  shopDomain: string | null;
  primaryDomain: string | null;
  planName: string | null;
  currency: string | null;
  timeZone: string;
  orders1d: number | null;
  sales1d: number | null;
  snapshotDate: string | null;
  orders7d: number | null;
  sales7d: number | null;
  orders30d: number | null;
  sales30d: number | null;
  sessions1d: number | null;
  conversionRate1d: number | null;
  sessions7d: number | null;
  conversionRate7d: number | null;
  sessions30d: number | null;
  conversionRate30d: number | null;
  salesAvailable: boolean;
  reportsAvailable: boolean;
  themeName: string | null;
  themeUpdatedAt: string | null;
  payload: Record<string, unknown>;
};

const SHOP_QUERY = /* GraphQL */ `
  query StoreSnapshotShop {
    shop {
      name
      myshopifyDomain
      currencyCode
      ianaTimezone
      primaryDomain {
        url
      }
      plan {
        displayName
      }
    }
    themes(first: 1, roles: [MAIN]) {
      nodes {
        name
        updatedAt
      }
    }
  }
`;

const ORDERS_PAGE_QUERY = /* GraphQL */ `
  query StoreSnapshotOrders($query: String!, $cursor: String) {
    orders(first: 100, query: $query, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

export function isAccessDenied(errors: GraphQlError[] | undefined) {
  return (errors ?? []).some((error) => {
    const code = error.extensions?.code?.toUpperCase() ?? "";
    const message = error.message.toLowerCase();
    return (
      code.includes("ACCESS") ||
      message.includes("access denied") ||
      message.includes("access_denied") ||
      message.includes("not authorized")
    );
  });
}

export async function shopifyGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQlResponse<T>> {
  const response = await fetch(
    `${shopAdminOrigin(shop)}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  const json = (await response.json().catch(() => null)) as GraphQlResponse<T> | null;
  if (!response.ok && !json) {
    throw new Error(`Shopify Admin API failed (${response.status}).`);
  }
  return json ?? {};
}

export function moneyAmount(value: string | null | undefined) {
  const amount = Number.parseFloat(value ?? "");
  return Number.isFinite(amount) ? amount : 0;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function orderQuerySince(since: Date, until?: Date) {
  const untilClause = until
    ? ` created_at:<='${until.toISOString()}'`
    : "";
  return `created_at:>='${since.toISOString()}'${untilClause} -status:cancelled`;
}

async function sumOrdersSince(
  shop: string,
  accessToken: string,
  since: Date,
  until?: Date,
): Promise<{ count: number; sales: number; currency: string | null }> {
  let cursor: string | null = null;
  let count = 0;
  let sales = 0;
  let currency: string | null = null;
  const query = orderQuerySince(since, until);

  for (let page = 0; page < 20; page += 1) {
    const result: GraphQlResponse<OrdersPage> = await shopifyGraphql<OrdersPage>(
      shop,
      accessToken,
      ORDERS_PAGE_QUERY,
      { query, cursor },
    );

    if (isAccessDenied(result.errors)) {
      const error = new Error("SALES_UNAVAILABLE");
      error.name = "SalesUnavailableError";
      throw error;
    }

    if (result.errors?.length) {
      throw new Error(result.errors.map((item) => item.message).join(" "));
    }

    const orders = result.data?.orders;
    if (!orders) break;

    for (const node of orders.nodes) {
      count += 1;
      const money = node.currentTotalPriceSet?.shopMoney;
      sales += moneyAmount(money?.amount);
      currency = money?.currencyCode ?? currency;
    }

    if (!orders.pageInfo.hasNextPage || !orders.pageInfo.endCursor) break;
    cursor = orders.pageInfo.endCursor;
  }

  return { count, sales: roundMoney(sales), currency };
}

export async function fetchStoreSnapshot(
  shop: string,
  accessToken: string,
): Promise<StoreSnapshotData> {
  const shopResult = await shopifyGraphql<{
    shop?: {
      name?: string;
      myshopifyDomain?: string;
      currencyCode?: string;
      ianaTimezone?: string | null;
      primaryDomain?: { url?: string } | null;
      plan?: { displayName?: string } | null;
    };
    themes?: { nodes: { name?: string; updatedAt?: string }[] };
  }>(shop, accessToken, SHOP_QUERY);

  if (shopResult.errors?.length && !shopResult.data?.shop) {
    throw new Error(shopResult.errors.map((item) => item.message).join(" "));
  }

  const shopNode = shopResult.data?.shop;
  const theme = shopResult.data?.themes?.nodes[0];
  const now = new Date();
  const timeZone = shopNode?.ianaTimezone || "Europe/London";
  const completeDay = lastCompleteLocalDay(now, timeZone);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let orders1d: number | null = null;
  let sales1d: number | null = null;
  let orders7d: number | null = null;
  let sales7d: number | null = null;
  let orders30d: number | null = null;
  let sales30d: number | null = null;
  let salesAvailable = true;
  let orderCurrency: string | null = null;

  try {
    const [day, week, month] = await Promise.all([
      sumOrdersSince(
        shop,
        accessToken,
        completeDay.startUtc,
        completeDay.endUtc,
      ),
      sumOrdersSince(shop, accessToken, since7d),
      sumOrdersSince(shop, accessToken, since30d),
    ]);
    orders1d = day.count;
    sales1d = day.sales;
    orders7d = week.count;
    sales7d = week.sales;
    orders30d = month.count;
    sales30d = month.sales;
    orderCurrency = month.currency ?? week.currency ?? day.currency;
  } catch (error) {
    if (error instanceof Error && error.name === "SalesUnavailableError") {
      salesAvailable = false;
    } else {
      throw error;
    }
  }

  const traffic = await fetchSnapshotTraffic(shop, accessToken, completeDay.ymd);

  return {
    shopName: shopNode?.name ?? null,
    shopDomain: shopNode?.myshopifyDomain ?? shop,
    primaryDomain: shopNode?.primaryDomain?.url ?? null,
    planName: shopNode?.plan?.displayName ?? null,
    currency: shopNode?.currencyCode ?? orderCurrency,
    timeZone,
    orders1d,
    sales1d,
    snapshotDate: completeDay.ymd,
    orders7d,
    sales7d,
    orders30d,
    sales30d,
    sessions1d: traffic.sessions1d,
    conversionRate1d: traffic.conversionRate1d,
    sessions7d: traffic.sessions7d,
    conversionRate7d: traffic.conversionRate7d,
    sessions30d: traffic.sessions30d,
    conversionRate30d: traffic.conversionRate30d,
    salesAvailable,
    reportsAvailable: traffic.reportsAvailable,
    themeName: theme?.name ?? null,
    themeUpdatedAt: theme?.updatedAt ?? null,
    payload: {
      shop: shopNode ?? null,
      theme: theme ?? null,
      sales_available: salesAvailable,
      reports_available: traffic.reportsAvailable,
      time_zone: timeZone,
      snapshot_date: completeDay.ymd,
      sessions: {
        "1d": traffic.sessions1d,
        "7d": traffic.sessions7d,
        "30d": traffic.sessions30d,
      },
      conversion_rate: {
        "1d": traffic.conversionRate1d,
        "7d": traffic.conversionRate7d,
        "30d": traffic.conversionRate30d,
      },
    },
  };
}
