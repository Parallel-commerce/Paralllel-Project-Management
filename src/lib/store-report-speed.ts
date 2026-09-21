import type { createClient } from "@/lib/supabase/server";
import type {
  ProjectStoreSpeedPage,
  ProjectStoreSpeedRun,
  SpeedPageKind,
  StoreReportSpeed,
  StoreReportSpeedPage,
} from "@/types/database";

const PAGE_ORDER: SpeedPageKind[] = ["home", "collection", "product", "cart"];

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function loadStoreReportSpeed(
  supabase: ServerClient,
  projectId: string,
  periodEndYmd: string,
  previousPeriodEndYmd: string,
): Promise<StoreReportSpeed | null> {
  const current = await latestSpeedRunOnOrBefore(
    supabase,
    projectId,
    periodEndYmd,
  );
  if (!current) return null;

  const previous = await latestSpeedRunOnOrBefore(
    supabase,
    projectId,
    previousPeriodEndYmd,
    current.captured_at,
  );

  const [{ data: currentPages }, { data: previousPages }] = await Promise.all([
    supabase
      .from("project_store_speed_pages")
      .select("*")
      .eq("run_id", current.id),
    previous
      ? supabase
          .from("project_store_speed_pages")
          .select("page_kind, performance_score")
          .eq("run_id", previous.id)
      : Promise.resolve({ data: [] as { page_kind: SpeedPageKind; performance_score: number | null }[] }),
  ]);

  const previousScore = new Map(
    (previousPages ?? []).map((page) => [page.page_kind, page.performance_score]),
  );

  const pages = [...(currentPages ?? [])]
    .sort(
      (a, b) => PAGE_ORDER.indexOf(a.page_kind) - PAGE_ORDER.indexOf(b.page_kind),
    )
    .map((page) => compactSpeedPage(page as ProjectStoreSpeedPage, previousScore));

  return {
    captured_at: current.captured_at,
    previous_captured_at: previous?.captured_at ?? null,
    origin: {
      passed: current.origin_passed,
      lcp_ms: asNumber(current.origin_lcp_ms),
      inp_ms: asNumber(current.origin_inp_ms),
      cls: asNumber(current.origin_cls),
      category: current.origin_category,
      url: current.origin_url,
    },
    pages,
  };
}

async function latestSpeedRunOnOrBefore(
  supabase: ServerClient,
  projectId: string,
  ymd: string,
  beforeIso?: string,
) {
  let query = supabase
    .from("project_store_speed_runs")
    .select("*")
    .eq("project_id", projectId)
    .lte("captured_at", `${ymd}T23:59:59.999Z`)
    .order("captured_at", { ascending: false })
    .limit(1);

  if (beforeIso) {
    query = query.lt("captured_at", beforeIso);
  }

  const { data } = await query.maybeSingle();
  return (data as ProjectStoreSpeedRun | null) ?? null;
}

function compactSpeedPage(
  page: ProjectStoreSpeedPage,
  previousScore: Map<SpeedPageKind, number | null>,
): StoreReportSpeedPage {
  const labScore = asNumber(page.performance_score);
  const previousLab = asNumber(previousScore.get(page.page_kind) ?? null);
  return {
    page_kind: page.page_kind,
    title: page.title || pageKindLabel(page.page_kind),
    url: page.url,
    lab_score: labScore,
    previous_lab_score: previousLab,
    lab_score_change:
      labScore != null && previousLab != null ? labScore - previousLab : null,
    lab_lcp_ms: asNumber(page.lab_lcp_ms),
    lab_tbt_ms: asNumber(page.lab_tbt_ms),
    lab_cls: asNumber(page.lab_cls),
    field_lcp_ms: asNumber(page.field_lcp_ms),
    field_inp_ms: asNumber(page.field_inp_ms),
    field_cls: asNumber(page.field_cls),
    field_passed: page.field_passed,
    field_category: page.field_category,
    opportunities: (page.opportunities ?? [])
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        title: item.title,
        savings_ms: item.savings_ms,
      })),
    error: page.error,
  };
}

export function pageKindLabel(kind: SpeedPageKind) {
  switch (kind) {
    case "home":
      return "Homepage";
    case "collection":
      return "Collection";
    case "product":
      return "Product";
    case "cart":
      return "Cart";
  }
}

export function compactSpeedForAi(speed: StoreReportSpeed | null | undefined) {
  if (!speed) return null;
  return {
    captured_at: speed.captured_at,
    previous_captured_at: speed.previous_captured_at,
    origin: {
      passed: speed.origin.passed,
      lcp_ms: speed.origin.lcp_ms,
      inp_ms: speed.origin.inp_ms,
      cls: speed.origin.cls,
      category: speed.origin.category,
    },
    pages: speed.pages.map((page) => ({
      page: pageKindLabel(page.page_kind),
      title: page.title,
      lab_score: page.lab_score,
      previous_lab_score: page.previous_lab_score,
      lab_score_change: page.lab_score_change,
      lab_lcp_ms: page.lab_lcp_ms,
      lab_tbt_ms: page.lab_tbt_ms,
      lab_cls: page.lab_cls,
      field_passed: page.field_passed,
      field_lcp_ms: page.field_lcp_ms,
      field_inp_ms: page.field_inp_ms,
      field_cls: page.field_cls,
      opportunities: page.opportunities,
      error: page.error,
    })),
  };
}

function asNumber(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
