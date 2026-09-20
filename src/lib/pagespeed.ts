export type CwvRating = "good" | "needs_improvement" | "poor";
export type SpeedPageKind = "home" | "collection" | "product" | "cart";
export type SpeedSnapshotSource = "manual" | "scheduled";

export type SpeedOpportunity = {
  id: string;
  title: string;
  savings_ms: number;
};

export type SpeedFieldMetrics = {
  lcp_ms: number | null;
  inp_ms: number | null;
  cls: number | null;
  category: CwvRating | null;
  passed: boolean | null;
};

export type SpeedLabMetrics = {
  performance_score: number | null;
  lcp_ms: number | null;
  tbt_ms: number | null;
  cls: number | null;
};

export type SpeedPageResult = {
  page_kind: SpeedPageKind;
  url: string;
  title: string;
  lab: SpeedLabMetrics;
  field: SpeedFieldMetrics;
  opportunities: SpeedOpportunity[];
  error: string | null;
};

export type SpeedRunDigest = {
  origin_url: string | null;
  origin: SpeedFieldMetrics;
  pages: SpeedPageResult[];
};

type PsiMetric = {
  percentile?: number;
  category?: string;
};

type PsiExperience = {
  overall_category?: string;
  metrics?: Record<string, PsiMetric>;
};

type PsiAudit = {
  id?: string;
  title?: string;
  numericValue?: number;
  details?: {
    type?: string;
    overallSavingsMs?: number;
  };
};

type PsiResponse = {
  error?: { message?: string; code?: number };
  loadingExperience?: PsiExperience;
  originLoadingExperience?: PsiExperience;
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, PsiAudit>;
  };
};

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export function hasPagespeedKey() {
  return Boolean(process.env.PAGESPEED_API_KEY?.trim());
}

function mapCategory(value: string | undefined): CwvRating | null {
  const raw = value?.toUpperCase();
  if (raw === "FAST") return "good";
  if (raw === "AVERAGE") return "needs_improvement";
  if (raw === "SLOW") return "poor";
  return null;
}

function metric(experience: PsiExperience | undefined, key: string) {
  return experience?.metrics?.[key];
}

function fieldCls(percentile: number | undefined) {
  if (percentile == null || !Number.isFinite(percentile)) return null;
  return percentile > 1 ? Math.round((percentile / 100) * 1000) / 1000 : percentile;
}

export function fieldMetricsFromExperience(
  experience: PsiExperience | undefined,
): SpeedFieldMetrics {
  const lcp = metric(experience, "LARGEST_CONTENTFUL_PAINT_MS");
  const inp = metric(experience, "INTERACTION_TO_NEXT_PAINT");
  const cls = metric(experience, "CUMULATIVE_LAYOUT_SHIFT_SCORE");
  const lcpMs = lcp?.percentile ?? null;
  const inpMs = inp?.percentile ?? null;
  const clsValue = fieldCls(cls?.percentile);
  const lcpRating = mapCategory(lcp?.category);
  const inpRating = mapCategory(inp?.category);
  const clsRating = mapCategory(cls?.category);
  let passed: boolean | null = null;
  if (lcpRating && clsRating) {
    passed =
      lcpRating === "good" &&
      clsRating === "good" &&
      (inpRating == null || inpRating === "good");
  }
  return {
    lcp_ms: lcpMs != null ? Math.round(lcpMs) : null,
    inp_ms: inpMs != null ? Math.round(inpMs) : null,
    cls: clsValue,
    category: mapCategory(experience?.overall_category) ?? (passed == null ? null : passed ? "good" : "poor"),
    passed,
  };
}

function labFromLighthouse(result: PsiResponse["lighthouseResult"]): SpeedLabMetrics {
  const audits = result?.audits ?? {};
  const score = result?.categories?.performance?.score;
  return {
    performance_score:
      score == null ? null : Math.round(score * 100),
    lcp_ms: audits["largest-contentful-paint"]?.numericValue
      ? Math.round(audits["largest-contentful-paint"].numericValue)
      : null,
    tbt_ms: audits["total-blocking-time"]?.numericValue
      ? Math.round(audits["total-blocking-time"].numericValue)
      : null,
    cls:
      audits["cumulative-layout-shift"]?.numericValue != null
        ? Math.round(audits["cumulative-layout-shift"].numericValue * 1000) / 1000
        : null,
  };
}

function opportunitiesFromLighthouse(
  result: PsiResponse["lighthouseResult"],
): SpeedOpportunity[] {
  const audits = Object.values(result?.audits ?? {});
  return audits
    .filter(
      (audit) =>
        audit.details?.type === "opportunity" &&
        (audit.details.overallSavingsMs ?? 0) > 50,
    )
    .map((audit) => ({
      id: audit.id ?? "",
      title: audit.title ?? "Opportunity",
      savings_ms: Math.round(audit.details?.overallSavingsMs ?? 0),
    }))
    .sort((a, b) => b.savings_ms - a.savings_ms)
    .slice(0, 3);
}

export async function runPagespeed(url: string): Promise<{
  page: Omit<SpeedPageResult, "page_kind" | "title">;
  origin: SpeedFieldMetrics;
}> {
  const key = process.env.PAGESPEED_API_KEY?.trim();
  if (!key) {
    throw new Error("PAGESPEED_API_KEY is not set.");
  }
  const endpoint = new URL(PSI_ENDPOINT);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("key", key);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.append("category", "performance");

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(90_000),
  });
  const json = (await response.json().catch(() => null)) as PsiResponse | null;
  if (!json) {
    throw new Error(`PageSpeed Insights failed (${response.status}).`);
  }
  if (json.error?.message) {
    throw new Error(json.error.message);
  }

  return {
    origin: fieldMetricsFromExperience(json.originLoadingExperience),
    page: {
      url,
      lab: labFromLighthouse(json.lighthouseResult),
      field: fieldMetricsFromExperience(json.loadingExperience),
      opportunities: opportunitiesFromLighthouse(json.lighthouseResult),
      error: null,
    },
  };
}

export function formatMs(value: number | string | null | undefined) {
  if (value == null || value === "") return "—";
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return "—";
  if (parsed >= 1000) return `${(parsed / 1000).toFixed(1)}s`;
  return `${Math.round(parsed)}ms`;
}

export function formatCls(value: number | string | null | undefined) {
  if (value == null || value === "") return "—";
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return parsed.toFixed(2);
}

export function cwvLabel(rating: CwvRating | null | undefined) {
  if (rating === "good") return "Good";
  if (rating === "needs_improvement") return "Needs work";
  if (rating === "poor") return "Poor";
  return "No field data";
}
