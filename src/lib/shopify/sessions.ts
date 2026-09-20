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
  const result = await runWithFallback(
    shop,
    accessToken,
    sessionsQl(range, true),
    sessionsQl(range, false),
  );
  if (!result.ok) {
    return {
      denied: result.reason === "denied",
      sessions: null as number | null,
      conversionRate: null as number | null,
    };
  }
  const row = result.rows[0];
  return {
    denied: false,
    sessions: asCount(rowNumber(row, "sessions")),
    conversionRate: conversionPercent(rowNumber(row, "conversion_rate")),
  };
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
      : { denied: false, sessions: null, conversionRate: null };

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
      reportsAvailable: true,
    };
  } catch {
    return EMPTY_TRAFFIC;
  }
}
