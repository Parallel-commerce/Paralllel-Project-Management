import {
  isAccessDenied,
  moneyAmount,
  roundMoney,
  shopifyGraphql,
  type GraphQlResponse,
} from "@/lib/shopify/admin";
import { isHeadlineOnlineOrder } from "@/lib/shopify/channels";
import {
  buildScorecard,
  periodMetric,
  resolveStoreMetricWindow,
  round1,
  type StoreMetricWindow,
} from "@/lib/store-report";
import type { ReportRangeInput } from "@/lib/reports";
import type { ReportPeriod } from "@/types/database";
import type {
  PeriodMetric,
  StoreChannelRow,
  StoreProductRow,
  StoreReferrerRow,
  StoreReportDay,
  StoreReportDigest,
} from "@/types/database";

type TableColumn = { name?: string; dataType?: string; displayName?: string };
type TableRow = Record<string, unknown>;

type ShopifyQlPayload = {
  shopifyqlQuery?: {
    parseErrors?: string[] | null;
    tableData?: {
      columns?: TableColumn[] | null;
      rows?: unknown;
    } | null;
  } | null;
};

type ShopPayload = {
  shop?: {
    name?: string;
    currencyCode?: string;
    ianaTimezone?: string;
    myshopifyDomain?: string;
  } | null;
};

type WeeklyOrderNode = {
  createdAt?: string;
  currentTotalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
  totalDiscountsSet?: { shopMoney?: { amount?: string } };
  channelInformation?: {
    displayName?: string | null;
    channelDefinition?: { channelName?: string | null } | null;
  } | null;
  customer?: { id?: string; numberOfOrders?: number | string | null } | null;
  lineItems?: {
    nodes?: {
      title?: string | null;
      quantity?: number | null;
      discountedTotalSet?: { shopMoney?: { amount?: string } };
    }[];
  };
};

type WeeklyOrdersPage = {
  orders?: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: WeeklyOrderNode[];
  };
};

const SHOPIFYQL = /* GraphQL */ `
  query WeeklyShopifyQL($q: String!) {
    shopifyqlQuery(query: $q) {
      parseErrors
      tableData {
        columns {
          name
          dataType
          displayName
        }
        rows
      }
    }
  }
`;

const SHOP_QUERY = /* GraphQL */ `
  query WeeklyStoreShop {
    shop {
      name
      currencyCode
      ianaTimezone
      myshopifyDomain
    }
  }
`;

const WEEKLY_ORDERS_QUERY = /* GraphQL */ `
  query WeeklyStoreOrders($query: String!, $cursor: String) {
    orders(first: 100, query: $query, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        createdAt
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
          }
        }
        channelInformation {
          displayName
          channelDefinition {
            channelName
          }
        }
        lineItems(first: 25) {
          nodes {
            title
            quantity
            discountedTotalSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }
    }
  }
`;

const WEEKLY_ORDERS_MINIMAL_QUERY = /* GraphQL */ `
  query WeeklyStoreOrdersMinimal($query: String!, $cursor: String) {
    orders(first: 100, query: $query, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        createdAt
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
          }
        }
      }
    }
  }
`;

function dateRangeClauses(window: StoreMetricWindow, compare: boolean) {
  const range = `SINCE ${window.weekStart} UNTIL ${window.weekEnd}`;
  if (!compare) return range;
  return `${range}\nCOMPARE TO ${window.previousWeekStart} UNTIL ${window.previousWeekEnd}`;
}

const ONLINE_STORE_WHERE = `WHERE sales_channel = 'Online Store'`;

function salesTotalsQl(window: StoreMetricWindow) {
  return `
FROM sales
SHOW total_sales, orders, average_order_value, discounts, net_sales, new_customers, orders_first_time, orders_returning
${ONLINE_STORE_WHERE}
${dateRangeClauses(window, true)}
`.trim();
}

function salesDailyQl(window: StoreMetricWindow) {
  return `
FROM sales
SHOW total_sales, orders
${ONLINE_STORE_WHERE}
TIMESERIES day
${dateRangeClauses(window, false)}
ORDER BY day ASC
`.trim();
}

function salesChannelsQl(window: StoreMetricWindow) {
  return `
FROM sales
SHOW net_sales, orders
GROUP BY sales_channel
${dateRangeClauses(window, true)}
ORDER BY net_sales DESC
`.trim();
}

function sessionsTotalsQl(window: StoreMetricWindow, humanOnly: boolean) {
  return `
FROM sessions
SHOW sessions, conversion_rate
${humanOnly ? "WHERE human_or_bot_session = 'human'\n" : ""}${dateRangeClauses(window, true)}
`.trim();
}

function sessionsDailyQl(window: StoreMetricWindow, humanOnly: boolean) {
  return `
FROM sessions
SHOW sessions, conversion_rate
${humanOnly ? "WHERE human_or_bot_session = 'human'\n" : ""}TIMESERIES day
${dateRangeClauses(window, false)}
ORDER BY day ASC
`.trim();
}

function referrersQl(window: StoreMetricWindow, humanOnly: boolean) {
  return `
FROM sessions
SHOW sessions
GROUP BY referrer_source
${humanOnly ? "WHERE human_or_bot_session = 'human'\n" : ""}${dateRangeClauses(window, false)}
ORDER BY sessions DESC
LIMIT 10
`.trim();
}

function productsQl(window: StoreMetricWindow) {
  return `
FROM sales
SHOW net_sales, net_items_sold
${ONLINE_STORE_WHERE}
GROUP BY product_title
${dateRangeClauses(window, false)}
ORDER BY net_sales DESC
LIMIT 10
`.trim();
}

function discountedOrdersQl(window: StoreMetricWindow) {
  return `
FROM sales
SHOW orders
WHERE discounts > 0 AND sales_channel = 'Online Store'
${dateRangeClauses(window, true)}
`.trim();
}

type ShopifyQlResult =
  | { ok: true; rows: TableRow[]; columns: TableColumn[] }
  | { ok: false; reason: "denied" | "parse" | "error"; message: string };

async function runShopifyQl(
  shop: string,
  accessToken: string,
  query: string,
): Promise<ShopifyQlResult> {
  const result = await shopifyGraphql<ShopifyQlPayload>(
    shop,
    accessToken,
    SHOPIFYQL,
    { q: query },
  );

  if (isAccessDenied(result.errors)) {
    return {
      ok: false,
      reason: "denied",
      message: result.errors?.map((item) => item.message).join(" ") ?? "Access denied",
    };
  }

  if (result.errors?.length && !result.data?.shopifyqlQuery) {
    return {
      ok: false,
      reason: "error",
      message: result.errors.map((item) => item.message).join(" "),
    };
  }

  const payload = result.data?.shopifyqlQuery;
  const parseErrors = (payload?.parseErrors ?? []).filter(Boolean);
  if (parseErrors.length) {
    return { ok: false, reason: "parse", message: parseErrors.join(" ") };
  }

  const table = payload?.tableData;
  if (!table) {
    return { ok: false, reason: "error", message: "ShopifyQL returned no table data." };
  }

  return {
    ok: true,
    rows: parseTableRows(table.columns ?? [], table.rows),
    columns: table.columns ?? [],
  };
}

function parseTableRows(columns: TableColumn[], rows: unknown): TableRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      return row as TableRow;
    }
    if (Array.isArray(row)) {
      const object: TableRow = {};
      columns.forEach((column, index) => {
        if (column.name) object[column.name] = row[index];
      });
      return object;
    }
    return {};
  });
}

function numeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number.parseFloat(String(value).replace(/%/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function rowNumber(row: TableRow | undefined, ...keys: string[]): number | null {
  if (!row) return null;
  for (const key of keys) {
    if (key in row) {
      const value = numeric(row[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function comparisonKeys(metric: string) {
  return [
    `comparison_${metric}__previous_period`,
    `comparison_${metric}__previous_week`,
    `${metric}__previous_period`,
    `${metric}_previous_period`,
  ];
}

function metricPair(row: TableRow | undefined, metric: string): PeriodMetric {
  return periodMetric(
    rowNumber(row, metric),
    rowNumber(row, ...comparisonKeys(metric)),
  );
}

function dateValue(row: TableRow): string | null {
  for (const key of ["day", "date", "day_timestamp", "month"]) {
    const value = row[key];
    if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  }
  return null;
}

function stringValue(row: TableRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function ratioPct(part: number | null, total: number | null): number | null {
  if (part == null || total == null || total === 0) return null;
  return round1((part / total) * 100);
}

/** ShopifyQL conversion_rate is a 0–1 fraction; returning rates are already percent. */
function conversionPercent(value: number | null): number | null {
  if (value == null) return null;
  if (value >= 0 && value <= 1) return round1(value * 100);
  return round1(value);
}

function conversionMetric(metric: PeriodMetric | null): PeriodMetric | null {
  if (!metric) return null;
  return periodMetric(
    conversionPercent(metric.this_week),
    conversionPercent(metric.last_week),
  );
}

function aovFrom(sales: number | null, orders: number | null): number | null {
  if (sales == null || orders == null) return null;
  if (orders === 0) return sales === 0 ? 0 : null;
  return roundMoney(sales / orders);
}

function firstRow(result: ShopifyQlResult): TableRow | undefined {
  return result.ok ? result.rows[0] : undefined;
}

export async function fetchShop(
  shop: string,
  accessToken: string,
): Promise<{ name: string | null; currency: string | null; timezone: string }> {
  const result = await shopifyGraphql<ShopPayload>(shop, accessToken, SHOP_QUERY);
  if (result.errors?.length && !result.data?.shop) {
    throw new Error(result.errors.map((item) => item.message).join(" "));
  }
  const node = result.data?.shop;
  return {
    name: node?.name ?? null,
    currency: node?.currencyCode ?? null,
    timezone: node?.ianaTimezone || "Europe/London",
  };
}

export async function fetchWeeklyStoreDigest(
  shop: string,
  accessToken: string,
  range: ReportRangeInput,
  now = new Date(),
): Promise<StoreReportDigest> {
  const shopInfo = await fetchShop(shop, accessToken);
  const window = resolveStoreMetricWindow(range, shopInfo.timezone, now);
  if ("error" in window) {
    throw new Error(window.error);
  }
  const period: ReportPeriod =
    range.preset === "last_month" || range.preset === "month_before_last"
      ? "month"
      : range.preset === "custom"
        ? "custom"
        : "week";
  const unavailable: string[] = [];
  const warnings: string[] = [];

  const salesTotals = await runShopifyQl(shop, accessToken, salesTotalsQl(window));
  let source: StoreReportDigest["source"] = "shopifyql";

  if (salesTotals.ok === false && salesTotals.reason === "denied") {
    warnings.push(
      "ShopifyQL needs the read_reports scope (and Protected Customer Data access). Used Admin orders instead. Sessions and conversion are unavailable.",
    );
    return finalizeDigest({
      source: "admin_orders",
      shopInfo,
      window,
      period,
      unavailable,
      warnings,
      fromAdmin: await fetchAdminWeekly(shop, accessToken, window, unavailable, warnings),
    });
  }

  if (!salesTotals.ok) {
    warnings.push(`ShopifyQL sales query failed (${salesTotals.message}). Used Admin orders instead.`);
    return finalizeDigest({
      source: "admin_orders",
      shopInfo,
      window,
      period,
      unavailable,
      warnings,
      fromAdmin: await fetchAdminWeekly(shop, accessToken, window, unavailable, warnings),
    });
  }

  const [
    salesDaily,
    channels,
    sessionsTotals,
    sessionsDaily,
    referrers,
    products,
    discountedOrders,
  ] = await Promise.all([
    runShopifyQl(shop, accessToken, salesDailyQl(window)),
    runShopifyQl(shop, accessToken, salesChannelsQl(window)),
    runWithFallback(
      shop,
      accessToken,
      sessionsTotalsQl(window, true),
      sessionsTotalsQl(window, false),
    ),
    runWithFallback(
      shop,
      accessToken,
      sessionsDailyQl(window, true),
      sessionsDailyQl(window, false),
    ),
    runWithFallback(
      shop,
      accessToken,
      referrersQl(window, true),
      referrersQl(window, false),
    ),
    runShopifyQl(shop, accessToken, productsQl(window)),
    runShopifyQl(shop, accessToken, discountedOrdersQl(window)),
  ]);

  if (sessionsTotals.ok === false && sessionsTotals.reason === "denied") {
    source = "mixed";
    warnings.push("Sessions and conversion need read_reports. Those metrics are unavailable.");
  }

  const totalsRow = firstRow(salesTotals);
  const totalSales = metricPair(totalsRow, "total_sales");
  const orders = metricPair(totalsRow, "orders");
  let aov = metricPair(totalsRow, "average_order_value");
  if (aov.this_week == null) {
    aov = periodMetric(
      aovFrom(totalSales.this_week, orders.this_week),
      aovFrom(totalSales.last_week, orders.last_week),
    );
  }
  const discounts = metricPair(totalsRow, "discounts");
  const newCustomers = metricPair(totalsRow, "new_customers");
  const firstTimeOrders = metricPair(totalsRow, "orders_first_time");
  const returningOrders = metricPair(totalsRow, "orders_returning");

  const returningCustomers: PeriodMetric | null =
    returningOrders.this_week != null || firstTimeOrders.this_week != null
      ? periodMetric(returningOrders.this_week, returningOrders.last_week)
      : null;

  const returningRate = periodMetric(
    ratioPct(returningOrders.this_week, orders.this_week),
    ratioPct(returningOrders.last_week, orders.last_week),
  );

  const discountOrders = discountedOrders.ok
    ? metricPair(firstRow(discountedOrders), "orders")
    : null;
  const discountOrderPct =
    discountOrders && (discountOrders.this_week != null || discountOrders.last_week != null)
      ? periodMetric(
          ratioPct(discountOrders.this_week, orders.this_week),
          ratioPct(discountOrders.last_week, orders.last_week),
        )
      : null;

  const avgDiscount =
    discounts.this_week != null && orders.this_week && orders.this_week > 0
      ? roundMoney(Math.abs(discounts.this_week) / orders.this_week)
      : null;

  const daily: StoreReportDay[] = [];
  if (salesDaily.ok) {
    for (const row of salesDaily.rows) {
      const date = dateValue(row);
      if (!date) continue;
      daily.push({
        date,
        sales: rowNumber(row, "total_sales", "net_sales"),
        orders: rowNumber(row, "orders"),
      });
    }
  }

  const sessionsRow = sessionsTotals.ok ? firstRow(sessionsTotals) : undefined;
  const sessions = sessionsTotals.ok ? metricPair(sessionsRow, "sessions") : null;
  const conversion = sessionsTotals.ok
    ? conversionMetric(metricPair(sessionsRow, "conversion_rate"))
    : null;

  if (!sessionsTotals.ok) {
    unavailable.push("sessions", "conversion_rate");
  }
  if (returningRate.this_week == null) unavailable.push("returning_customer_rate");
  if (!channels.ok) unavailable.push("sales_channels");
  if (!products.ok) unavailable.push("products");
  if (!referrers.ok) unavailable.push("referrers");
  if (!discountOrderPct) unavailable.push("discount_order_pct");

  const sessionsDailyRows: StoreReportDay[] = [];
  if (sessionsDaily.ok) {
    for (const row of sessionsDaily.rows) {
      const date = dateValue(row);
      if (!date) continue;
      sessionsDailyRows.push({
        date,
        sessions: rowNumber(row, "sessions"),
        conversion_rate: conversionPercent(rowNumber(row, "conversion_rate")),
      });
    }
  }

  return finalizeDigest({
    source,
    shopInfo,
    window,
    period,
    unavailable,
    warnings,
    fromShopifyQl: {
      totalSales,
      orders,
      aov,
      discounts,
      discountOrderPct,
      avgDiscount,
      daily,
      channels: channels.ok ? mapChannels(channels.rows, null) : [],
      newCustomers: newCustomers.this_week != null ? newCustomers : null,
      returningCustomers,
      returningRate: returningRate.this_week != null ? returningRate : null,
      conversion: conversion?.this_week != null ? conversion : null,
      sessions: sessions?.this_week != null ? sessions : null,
      products: products.ok ? mapProducts(products.rows) : [],
      referrers: referrers.ok
        ? mapReferrers(referrers.rows, sessions?.this_week ?? null)
        : [],
      sessionsDaily: sessionsDailyRows,
    },
  });
}

async function runWithFallback(
  shop: string,
  accessToken: string,
  preferred: string,
  fallback: string,
) {
  const first = await runShopifyQl(shop, accessToken, preferred);
  if (first.ok || first.reason === "denied") return first;
  return runShopifyQl(shop, accessToken, fallback);
}

function mapChannels(rows: TableRow[], totalSales: number | null): StoreChannelRow[] {
  const allSales =
    totalSales ??
    rows.reduce((sum, row) => {
      if ((stringValue(row, "sales_channel", "channel", "order_sales_channel") ?? "").toLowerCase() === "total") {
        return sum;
      }
      return sum + (rowNumber(row, "net_sales", "total_sales") ?? 0);
    }, 0);
  return rows
    .map((row) => {
      const name =
        stringValue(row, "sales_channel", "channel", "order_sales_channel") ??
        "Unknown";
      const sales = rowNumber(row, "net_sales", "total_sales") ?? 0;
      const previous = rowNumber(
        row,
        ...comparisonKeys("net_sales"),
        ...comparisonKeys("total_sales"),
      );
      return {
        name,
        sales,
        previous_sales: previous,
        share_pct: ratioPct(sales, allSales),
        change_pct: periodMetric(sales, previous).change_pct,
      };
    })
    .filter((row) => row.name.toLowerCase() !== "total");
}

function mapProducts(rows: TableRow[]): StoreProductRow[] {
  return rows
    .map((row) => ({
      title: stringValue(row, "product_title", "product") ?? "Unknown",
      units: rowNumber(row, "net_items_sold", "items_sold"),
      sales: rowNumber(row, "net_sales", "total_sales"),
      sell_through: rowNumber(row, "sell_through_rate"),
    }))
    .filter((row) => row.title.toLowerCase() !== "total");
}

function mapReferrers(
  rows: TableRow[],
  totalSessions: number | null,
): StoreReferrerRow[] {
  return rows
    .map((row) => {
      const sessions = rowNumber(row, "sessions") ?? 0;
      return {
        source: stringValue(row, "referrer_source", "referrer") ?? "Unknown",
        sessions,
        share_pct: ratioPct(sessions, totalSessions),
      };
    })
    .filter((row) => row.source.toLowerCase() !== "total");
}

function allSalesFromChannels(channels: StoreChannelRow[]): PeriodMetric | null {
  if (channels.length === 0) return null;
  const thisWeek = roundMoney(
    channels.reduce((sum, row) => sum + row.sales, 0),
  );
  const previousParts = channels.map((row) => row.previous_sales);
  const lastWeek = previousParts.every((value) => value != null)
    ? roundMoney(previousParts.reduce((sum, value) => sum + (value ?? 0), 0))
    : null;
  return periodMetric(thisWeek, lastWeek);
}

async function fetchAdminWeekly(
  shop: string,
  accessToken: string,
  window: StoreMetricWindow,
  unavailable: string[],
  warnings: string[],
) {
  unavailable.push("sessions", "conversion_rate", "referrers", "sell_through");

  const [thisWeek, lastWeek] = await Promise.all([
    sumWeeklyOrders(shop, accessToken, window.weekStartUtc, window.weekEndUtc),
    sumWeeklyOrders(
      shop,
      accessToken,
      window.previousWeekStartUtc,
      window.previousWeekEndUtc,
    ),
  ]);

  if (!thisWeek.available) {
    throw new Error(
      "Sales and orders need the read_orders scope. Add it on the custom app and reconnect.",
    );
  }

  const totalSales = periodMetric(thisWeek.sales, lastWeek.available ? lastWeek.sales : null);
  const orders = periodMetric(thisWeek.orders, lastWeek.available ? lastWeek.orders : null);
  const aov = periodMetric(
    aovFrom(thisWeek.sales, thisWeek.orders),
    lastWeek.available ? aovFrom(lastWeek.sales, lastWeek.orders) : null,
  );
  const discounts = periodMetric(
    thisWeek.discounts,
    lastWeek.available ? lastWeek.discounts : null,
  );
  const discountOrderPct = periodMetric(
    ratioPct(thisWeek.discountedOrders, thisWeek.orders),
    lastWeek.available ? ratioPct(lastWeek.discountedOrders, lastWeek.orders) : null,
  );
  const avgDiscount =
    thisWeek.discountedOrders > 0
      ? roundMoney(thisWeek.discounts / thisWeek.discountedOrders)
      : thisWeek.orders > 0
        ? roundMoney(thisWeek.discounts / thisWeek.orders)
        : null;

  const newCustomers =
    thisWeek.newCustomers != null
      ? periodMetric(
          thisWeek.newCustomers,
          lastWeek.available ? lastWeek.newCustomers : null,
        )
      : null;
  const returningCustomers =
    thisWeek.returningCustomers != null
      ? periodMetric(
          thisWeek.returningCustomers,
          lastWeek.available ? lastWeek.returningCustomers : null,
        )
      : null;
  const returningRate =
    thisWeek.returningCustomers != null && thisWeek.newCustomers != null
      ? periodMetric(
          ratioPct(
            thisWeek.returningCustomers,
            thisWeek.newCustomers + thisWeek.returningCustomers,
          ),
          lastWeek.available &&
            lastWeek.returningCustomers != null &&
            lastWeek.newCustomers != null
            ? ratioPct(
                lastWeek.returningCustomers,
                lastWeek.newCustomers + lastWeek.returningCustomers,
              )
            : null,
        )
      : null;

  if (newCustomers == null) {
    unavailable.push(
      "new_customers",
      "returning_customers",
      "returning_customer_rate",
    );
  }

  if (!lastWeek.available) {
    warnings.push("Previous-week Admin order totals were unavailable.");
  }

  const allChannelSales = Object.values(thisWeek.channels).reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    totalSales,
    orders,
    aov,
    discounts,
    discountOrderPct,
    avgDiscount,
    daily: thisWeek.daily,
    channels: Object.entries(thisWeek.channels)
      .map(([name, sales]) => {
        const previous = lastWeek.channels[name] ?? null;
        return {
          name,
          sales,
          previous_sales: previous,
          share_pct: ratioPct(sales, allChannelSales),
          change_pct: periodMetric(sales, previous).change_pct,
        } satisfies StoreChannelRow;
      })
      .sort((a, b) => b.sales - a.sales),
    newCustomers,
    returningCustomers,
    returningRate,
    conversion: null as PeriodMetric | null,
    sessions: null as PeriodMetric | null,
    products: Object.entries(thisWeek.products)
      .map(([title, value]) => ({
        title,
        units: value.units,
        sales: roundMoney(value.sales),
        sell_through: null,
      }))
      .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0))
      .slice(0, 10),
    referrers: [] as StoreReferrerRow[],
    sessionsDaily: [] as StoreReportDay[],
    currency: thisWeek.currency,
  };
}

async function sumWeeklyOrders(
  shop: string,
  accessToken: string,
  since: Date,
  until: Date,
) {
  const rich = await paginateWeeklyOrders(
    shop,
    accessToken,
    since,
    until,
    WEEKLY_ORDERS_QUERY,
  );
  if (rich.available || !rich.retryable) return rich;
  return paginateWeeklyOrders(
    shop,
    accessToken,
    since,
    until,
    WEEKLY_ORDERS_MINIMAL_QUERY,
  );
}

async function paginateWeeklyOrders(
  shop: string,
  accessToken: string,
  since: Date,
  until: Date,
  document: string,
) {
  let cursor: string | null = null;
  let orders = 0;
  let sales = 0;
  let discounts = 0;
  let discountedOrders = 0;
  let currency: string | null = null;
  const daily = new Map<string, { sales: number; orders: number }>();
  const channels: Record<string, number> = {};
  const products: Record<string, { units: number; sales: number }> = {};
  const query = `created_at:>='${since.toISOString()}' created_at:<='${until.toISOString()}' -status:cancelled`;

  for (let page = 0; page < 20; page += 1) {
    const result: GraphQlResponse<WeeklyOrdersPage> = await shopifyGraphql<WeeklyOrdersPage>(
      shop,
      accessToken,
      document,
      { query, cursor },
    );

    if ((isAccessDenied(result.errors) || result.errors?.length) && !result.data?.orders) {
      return emptyWeeklyOrders(Boolean(result.errors?.length));
    }

    if (result.errors?.length && result.data?.orders) {
      // Partial data is usable (for example a missing optional field).
    } else if (result.errors?.length) {
      throw new Error(result.errors.map((item) => item.message).join(" "));
    }

    const pageOrders = result.data?.orders;
    if (!pageOrders) break;

    for (const node of pageOrders.nodes) {
      const amount = moneyAmount(node.currentTotalPriceSet?.shopMoney?.amount);
      const discount = moneyAmount(node.totalDiscountsSet?.shopMoney?.amount);
      const channel =
        node.channelInformation?.displayName ||
        node.channelInformation?.channelDefinition?.channelName;
      if (channel) {
        channels[channel] = (channels[channel] ?? 0) + amount;
      }
      if (!isHeadlineOnlineOrder(channel)) continue;

      orders += 1;
      sales += amount;
      discounts += discount;
      if (discount > 0.004) discountedOrders += 1;
      currency = node.currentTotalPriceSet?.shopMoney?.currencyCode ?? currency;

      const created = node.createdAt ? node.createdAt.slice(0, 10) : null;
      if (created) {
        const bucket = daily.get(created) ?? { sales: 0, orders: 0 };
        bucket.sales += amount;
        bucket.orders += 1;
        daily.set(created, bucket);
      }

      for (const item of node.lineItems?.nodes ?? []) {
        const title = item.title?.trim() || "Unknown";
        const current = products[title] ?? { units: 0, sales: 0 };
        current.units += item.quantity ?? 0;
        current.sales += moneyAmount(item.discountedTotalSet?.shopMoney?.amount);
        products[title] = current;
      }
    }

    if (!pageOrders.pageInfo.hasNextPage || !pageOrders.pageInfo.endCursor) break;
    cursor = pageOrders.pageInfo.endCursor;
  }

  return {
    available: true as const,
    retryable: false as const,
    orders,
    sales: roundMoney(sales),
    discounts: roundMoney(discounts),
    discountedOrders,
    currency,
    daily: [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date,
        sales: roundMoney(value.sales),
        orders: value.orders,
      })),
    channels,
    products,
    newCustomers: null,
    returningCustomers: null,
  };
}

function emptyWeeklyOrders(retryable: boolean) {
  return {
    available: false as const,
    retryable,
    orders: 0,
    sales: 0,
    discounts: 0,
    discountedOrders: 0,
    currency: null,
    daily: [] as StoreReportDay[],
    channels: {} as Record<string, number>,
    products: {} as Record<string, { units: number; sales: number }>,
    newCustomers: null,
    returningCustomers: null,
  };
}

function strongestWeakest(daily: StoreReportDay[]) {
  const withSales = daily.filter((row) => row.sales != null);
  if (withSales.length === 0) {
    return { strongest: null, weakest: null };
  }
  const strongest = withSales.reduce((best, row) =>
    (row.sales ?? 0) > (best.sales ?? 0) ? row : best,
  );
  const weakest = withSales.reduce((worst, row) =>
    (row.sales ?? 0) < (worst.sales ?? 0) ? row : worst,
  );
  return {
    strongest: { date: strongest.date, sales: strongest.sales ?? 0 },
    weakest: { date: weakest.date, sales: weakest.sales ?? 0 },
  };
}

function conversionExtremes(daily: StoreReportDay[]) {
  const withRate = daily.filter((row) => row.conversion_rate != null);
  if (withRate.length === 0) {
    return { best: null, worst: null };
  }
  const best = withRate.reduce((lead, row) =>
    (row.conversion_rate ?? 0) > (lead.conversion_rate ?? 0) ? row : lead,
  );
  const worst = withRate.reduce((lead, row) =>
    (row.conversion_rate ?? 0) < (lead.conversion_rate ?? 0) ? row : lead,
  );
  return {
    best: { date: best.date, rate: best.conversion_rate ?? 0 },
    worst: { date: worst.date, rate: worst.conversion_rate ?? 0 },
  };
}

type WeeklyNumbers = {
  totalSales: PeriodMetric;
  orders: PeriodMetric;
  aov: PeriodMetric;
  discounts: PeriodMetric;
  discountOrderPct: PeriodMetric | null;
  avgDiscount: number | null;
  daily: StoreReportDay[];
  channels: StoreChannelRow[];
  newCustomers: PeriodMetric | null;
  returningCustomers: PeriodMetric | null;
  returningRate: PeriodMetric | null;
  conversion: PeriodMetric | null;
  sessions: PeriodMetric | null;
  products: StoreProductRow[];
  referrers: StoreReferrerRow[];
  sessionsDaily: StoreReportDay[];
  currency?: string | null;
};

function finalizeDigest(input: {
  source: StoreReportDigest["source"];
  shopInfo: { name: string | null; currency: string | null; timezone: string };
  window: StoreMetricWindow;
  period: ReportPeriod;
  unavailable: string[];
  warnings: string[];
  fromShopifyQl?: WeeklyNumbers;
  fromAdmin?: WeeklyNumbers;
}): StoreReportDigest {
  const numbers = input.fromShopifyQl ?? input.fromAdmin;
  if (!numbers) {
    throw new Error("Could not load store metrics for the selected range.");
  }

  const days = strongestWeakest(numbers.daily);
  const conversionDays = conversionExtremes(numbers.sessionsDaily);
  const uniqueUnavailable = [...new Set(input.unavailable)];
  const periodNoun =
    input.period === "month" ? "month" : input.period === "custom" ? "period" : "week";

  if (numbers.totalSales.this_week == null && numbers.orders.this_week == null) {
    throw new Error("Could not load sales or orders from Shopify for the selected range.");
  }

  return {
    kind: "store",
    source: input.source,
    shop_name: input.shopInfo.name,
    currency: numbers.currency ?? input.shopInfo.currency,
    timezone: input.shopInfo.timezone,
    period: input.period,
    week_start: input.window.weekStart,
    week_end: input.window.weekEnd,
    previous_week_start: input.window.previousWeekStart,
    previous_week_end: input.window.previousWeekEnd,
    unavailable: uniqueUnavailable,
    warnings: input.warnings,
    sales_scope: "online_store",
    all_sales: allSalesFromChannels(numbers.channels),
    scorecard: buildScorecard({
      totalSales: numbers.totalSales,
      orders: numbers.orders,
      conversionRate: numbers.conversion,
      aov: numbers.aov,
      returningRate: numbers.returningRate,
      sessions: numbers.sessions,
      periodNoun,
    }),
    sales: {
      total_sales: numbers.totalSales,
      orders: numbers.orders,
      aov: numbers.aov,
      discounts: numbers.discounts,
      discount_order_pct: numbers.discountOrderPct,
      avg_discount: numbers.avgDiscount,
      strongest_day: days.strongest,
      weakest_day: days.weakest,
      daily: numbers.daily,
    },
    channels: numbers.channels,
    customers: {
      new: numbers.newCustomers,
      returning: numbers.returningCustomers,
      returning_rate: numbers.returningRate,
    },
    conversion: {
      rate: numbers.conversion,
      sessions: numbers.sessions,
      best_day: conversionDays.best,
      worst_day: conversionDays.worst,
    },
    products: numbers.products,
    referrers: numbers.referrers,
    sessions_daily: numbers.sessionsDaily,
  };
}
