import { isAccessDenied, shopifyGraphql } from "@/lib/shopify/admin";
import { round1 } from "@/lib/store-report";

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

type ShopifyQlResult =
  | { ok: true; rows: TableRow[] }
  | { ok: false; reason: "denied" | "parse" | "error"; message: string };

export type SnapshotTraffic = {
  sessions1d: number | null;
  conversionRate1d: number | null;
  sessions7d: number | null;
  conversionRate7d: number | null;
  sessions30d: number | null;
  conversionRate30d: number | null;
  sessions1dPrevYear: number | null;
  conversionRate1dPrevYear: number | null;
  sessions7dPrevYear: number | null;
  conversionRate7dPrevYear: number | null;
  sessions30dPrevYear: number | null;
  conversionRate30dPrevYear: number | null;
  reportsAvailable: boolean;
};

const SHOPIFYQL = /* GraphQL */ `
  query SnapshotShopifyQL($q: String!) {
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

const EMPTY_TRAFFIC: SnapshotTraffic = {
  sessions1d: null,
  conversionRate1d: null,
  sessions7d: null,
  conversionRate7d: null,
  sessions30d: null,
  conversionRate30d: null,
  sessions1dPrevYear: null,
  conversionRate1dPrevYear: null,
  sessions7dPrevYear: null,
  conversionRate7dPrevYear: null,
  sessions30dPrevYear: null,
  conversionRate30dPrevYear: null,
  reportsAvailable: false,
};

function sessionsQl(range: string, humanOnly: boolean) {
  return `
FROM sessions
SHOW sessions, conversion_rate
${humanOnly ? "WHERE human_or_bot_session = 'human'\n" : ""}${range}
`.trim();
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

function rowNumber(row: TableRow | undefined, key: string): number | null {
  if (!row || !(key in row)) return null;
  return numeric(row[key]);
}

function comparisonNumber(row: TableRow | undefined, metric: string): number | null {
  if (!row) return null;
  const metricKey = metric.toLowerCase();
  const keys = Object.keys(row).filter((key) => {
    const normalized = key.toLowerCase();
    if (normalized.includes("percent") || normalized.endsWith("_pct")) return false;
    return (
      normalized.startsWith(`comparison_${metricKey}`) ||
      normalized === `${metricKey}__previous_year` ||
      normalized === `${metricKey}_previous_year`
    );
  });
  const key =
    keys.find((name) => name.toLowerCase().includes("previous_year")) ?? keys[0];
  return key ? rowNumber(row, key) : null;
}

/** ShopifyQL conversion_rate is a 0–1 fraction. */
function conversionPercent(value: number | null): number | null {
  if (value == null) return null;
  if (value >= 0 && value <= 1) return round1(value * 100);
  return round1(value);
}

function asCount(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value);
}

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
      message:
        result.errors?.map((item) => item.message).join(" ") ?? "Access denied",
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
  };
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

async function sessionsWindow(
  shop: string,
  accessToken: string,
  range: string,
) {
  const comparedRange = `${range}\nCOMPARE TO previous_year`;
  let result = await runWithFallback(
    shop,
    accessToken,
    sessionsQl(comparedRange, true),
    sessionsQl(comparedRange, false),
  );
  let compared = result.ok;
  if (!result.ok && result.reason !== "denied") {
    result = await runWithFallback(
      shop,
      accessToken,
      sessionsQl(range, true),
      sessionsQl(range, false),
    );
    compared = false;
  }
  if (!result.ok) {
    return {
      denied: result.reason === "denied",
      sessions: null as number | null,
      conversionRate: null as number | null,
      sessionsPrevYear: null as number | null,
      conversionRatePrevYear: null as number | null,
    };
  }
  const row = result.rows[0];
  return {
    denied: false,
    sessions: asCount(rowNumber(row, "sessions")),
    conversionRate: conversionPercent(rowNumber(row, "conversion_rate")),
    sessionsPrevYear: compared
      ? asCount(comparisonNumber(row, "sessions"))
      : null,
    conversionRatePrevYear: compared
      ? conversionPercent(comparisonNumber(row, "conversion_rate"))
      : null,
  };
}

export type SnapshotSalesYearAgo = {
  orders1d: number | null;
  sales1d: number | null;
  orders7d: number | null;
  sales7d: number | null;
  orders30d: number | null;
  sales30d: number | null;
  orders1dCurrent: number | null;
  sales1dCurrent: number | null;
  orders7dCurrent: number | null;
  sales7dCurrent: number | null;
  orders30dCurrent: number | null;
  sales30dCurrent: number | null;
  error: string | null;
};

const EMPTY_SALES_YEAR_AGO: SnapshotSalesYearAgo = {
  orders1d: null,
  sales1d: null,
  orders7d: null,
  sales7d: null,
  orders30d: null,
  sales30d: null,
  orders1dCurrent: null,
  sales1dCurrent: null,
  sales7dCurrent: null,
  orders7dCurrent: null,
  orders30dCurrent: null,
  sales30dCurrent: null,
  error: null,
};

function roundSales(value: number | null) {
  if (value == null) return null;
  return Math.round(value * 100) / 100;
}

function salesYearQl(dateClause: string) {
  return `
FROM sales
SHOW orders, total_sales
WHERE sales_channel = 'Online Store'
${dateClause}
`.trim();
}

async function salesYearWindow(shop: string, accessToken: string, range: string) {
  const result = await runShopifyQl(shop, accessToken, salesYearQl(range));
  if (!result.ok) {
    return {
      denied: result.reason === "denied",
      error: result.message,
      orders: null as number | null,
      sales: null as number | null,
      ordersPrevYear: null as number | null,
      salesPrevYear: null as number | null,
    };
  }
  const row = result.rows[0];
  return {
    denied: false,
    error: null as string | null,
    orders: asCount(rowNumber(row, "orders")),
    sales: roundSales(rowNumber(row, "total_sales")),
    ordersPrevYear: asCount(comparisonNumber(row, "orders")),
    salesPrevYear: roundSales(comparisonNumber(row, "total_sales")),
  };
}

/**
 * Prior-year Online Store orders and sales.
 * The Order API only returns 60 days, so year-ago totals come from ShopifyQL.
 */
export async function fetchSnapshotSalesYearAgo(
  shop: string,
  accessToken: string,
  ranges: { day: string | null; week: string; month: string },
): Promise<SnapshotSalesYearAgo> {
  try {
    const day = ranges.day
      ? await salesYearWindow(shop, accessToken, ranges.day)
      : null;
    if (day?.denied) return { ...EMPTY_SALES_YEAR_AGO, error: day.error };

    const [week, month] = await Promise.all([
      salesYearWindow(shop, accessToken, ranges.week),
      salesYearWindow(shop, accessToken, ranges.month),
    ]);
    if (week.denied || month.denied) {
      return {
        ...EMPTY_SALES_YEAR_AGO,
        error: week.error ?? month.error,
      };
    }

    return {
      orders1d: day?.ordersPrevYear ?? null,
      sales1d: day?.salesPrevYear ?? null,
      orders7d: week.ordersPrevYear,
      sales7d: week.salesPrevYear,
      orders30d: month.ordersPrevYear,
      sales30d: month.salesPrevYear,
      orders1dCurrent: day?.orders ?? null,
      sales1dCurrent: day?.sales ?? null,
      orders7dCurrent: week.orders,
      sales7dCurrent: week.sales,
      orders30dCurrent: month.orders,
      sales30dCurrent: month.sales,
      error: day?.error ?? week.error ?? month.error,
    };
  } catch (error) {
    return {
      ...EMPTY_SALES_YEAR_AGO,
      error: error instanceof Error ? error.message : "Could not load last year's sales.",
    };
  }
}

export async function fetchSnapshotTraffic(
  shop: string,
  accessToken: string,
  snapshotDate: string | null,
): Promise<SnapshotTraffic> {
  try {
    const dayRange = snapshotDate
      ? `SINCE ${snapshotDate} UNTIL ${snapshotDate}`
      : null;

    const day = dayRange
      ? await sessionsWindow(shop, accessToken, dayRange)
      : {
          denied: false,
          sessions: null,
          conversionRate: null,
          sessionsPrevYear: null,
          conversionRatePrevYear: null,
        };

    if (day.denied) return EMPTY_TRAFFIC;

    const [week, month] = await Promise.all([
      sessionsWindow(shop, accessToken, "SINCE -7d UNTIL today"),
      sessionsWindow(shop, accessToken, "SINCE -30d UNTIL today"),
    ]);

    if (week.denied || month.denied) return EMPTY_TRAFFIC;

    return {
      sessions1d: day.sessions,
      conversionRate1d: day.conversionRate,
      sessions7d: week.sessions,
      conversionRate7d: week.conversionRate,
      sessions30d: month.sessions,
      conversionRate30d: month.conversionRate,
      sessions1dPrevYear: day.sessionsPrevYear,
      conversionRate1dPrevYear: day.conversionRatePrevYear,
      sessions7dPrevYear: week.sessionsPrevYear,
      conversionRate7dPrevYear: week.conversionRatePrevYear,
      sessions30dPrevYear: month.sessionsPrevYear,
      conversionRate30dPrevYear: month.conversionRatePrevYear,
      reportsAvailable: true,
    };
  } catch {
    return EMPTY_TRAFFIC;
  }
}
