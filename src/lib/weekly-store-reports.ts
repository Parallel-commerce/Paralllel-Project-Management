import type { SupabaseClient } from "@supabase/supabase-js";

import { createProgressReportDraft } from "@/lib/generate-progress-report";
import {
  findStoreReportForPeriod,
  generateStoreReportDrafts,
} from "@/lib/generate-store-report";
import { dueGmtMonthWindow } from "@/lib/reports";
import { resolveStoreAccess } from "@/lib/shopify/connection";
import { fetchShop } from "@/lib/shopify/weekly";
import { lastCompleteMonth, lastCompleteWeek } from "@/lib/store-report";
import type {
  Database,
  ProjectShopifyConnection,
  ScheduledStoreReportPeriod,
  WeeklyStoreReportRunStatus,
} from "@/types/database";

/** Monday 07:00 in South Africa (UTC+2, no daylight saving) is 05:00 UTC. */
export const WEEKLY_REPORT_TIME_ZONE = "Africa/Johannesburg";

const CONCURRENCY = 2;
/** Stop starting new stores before the 5-minute Hobby function limit. */
const START_BUDGET_MS = 4 * 60 * 1000;
const STALE_RUNNING_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 2;

type Db = SupabaseClient<Database>;

type StoreRow = {
  project_id: string;
  shop_domain: string;
  access_token_ciphertext: string | null;
  projects: { name: string } | { name: string }[] | null;
};

export type WeeklyStoreReportResult = {
  projectId: string;
  projectName: string;
  status: "generated" | "skipped" | "failed";
  reportId?: string;
  error?: string;
};

function projectNameOf(row: StoreRow) {
  const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
  return project?.name ?? "Store";
}

function clipError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Could not generate the report.";
  return message.slice(0, 500);
}

function johannesburgParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: WEEKLY_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday"),
  };
}

/** Monday 00:00 in Africa/Johannesburg for the week containing `now`. */
export function johannesburgMondayStart(now = new Date()) {
  const parts = johannesburgParts(now);
  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayIndex[parts.weekday] ?? 1;
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceMonday),
  );
  const ymd = monday.toISOString().slice(0, 10);
  return new Date(`${ymd}T00:00:00+02:00`);
}

export function mondayReportTimeHasPassed(now = new Date()) {
  const seven = johannesburgMondayStart(now).getTime() + 7 * 60 * 60 * 1000;
  return now.getTime() >= seven;
}

function periodWindow(period: ScheduledStoreReportPeriod, timeZone: string) {
  return period === "month"
    ? lastCompleteMonth(new Date(), timeZone)
    : lastCompleteWeek(new Date(), timeZone);
}

async function claimRun(
  supabase: Db,
  input: {
    projectId: string;
    period: ScheduledStoreReportPeriod;
    reportKind: "store" | "progress";
    weekStart: string;
    weekEnd: string;
  },
): Promise<{ id: string } | "skip"> {
  const { data: existing, error: loadError } = await supabase
    .from("weekly_store_report_runs")
    .select("id, status, attempts, updated_at")
    .eq("project_id", input.projectId)
    .eq("period", input.period)
    .eq("report_kind", input.reportKind)
    .eq("week_start", input.weekStart)
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }

  if (!existing) {
    const { data, error } = await supabase
      .from("weekly_store_report_runs")
      .insert({
        project_id: input.projectId,
        period: input.period,
        report_kind: input.reportKind,
        week_start: input.weekStart,
        week_end: input.weekEnd,
        status: "running",
        attempts: 1,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return "skip";
    if (error || !data) {
      throw new Error(error?.message ?? "Could not record the report run.");
    }
    return { id: data.id };
  }

  if (existing.status === "generated" || existing.status === "skipped") {
    return "skip";
  }

  const updatedAt = new Date(existing.updated_at).getTime();
  const stale =
    existing.status === "running" &&
    Date.now() - updatedAt > STALE_RUNNING_MS;
  const retryable =
    existing.status === "failed" && existing.attempts < MAX_ATTEMPTS;

  if (!stale && !retryable) return "skip";

  const nextAttempts = retryable ? existing.attempts + 1 : existing.attempts;
  const update = supabase
    .from("weekly_store_report_runs")
    .update({
      status: "running" satisfies WeeklyStoreReportRunStatus,
      error: null,
      attempts: nextAttempts,
      week_end: input.weekEnd,
    })
    .eq("id", existing.id);

  const claimed = retryable
    ? await update
        .eq("status", "failed")
        .eq("attempts", existing.attempts)
        .select("id")
        .maybeSingle()
    : await update
        .eq("status", "running")
        .eq("updated_at", existing.updated_at)
        .select("id")
        .maybeSingle();

  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data) return "skip";
  return { id: claimed.data.id };
}

async function finishRun(
  supabase: Db,
  id: string,
  patch: {
    status: "generated" | "skipped" | "failed";
    reportId: string | null;
    error: string | null;
  },
) {
  const { error } = await supabase
    .from("weekly_store_report_runs")
    .update({
      status: patch.status,
      report_id: patch.reportId,
      error: patch.error,
    })
    .eq("id", id);
  if (error) {
    console.error("weekly report run update failed:", error.message);
  }
}

async function recordFailure(
  supabase: Db,
  input: {
    projectId: string;
    projectName: string;
    period: ScheduledStoreReportPeriod;
    reportKind: "store" | "progress";
    weekStart: string;
    weekEnd: string;
    error: string;
  },
): Promise<WeeklyStoreReportResult> {
  try {
    const claim = await claimRun(supabase, input);
    if (claim !== "skip") {
      await finishRun(supabase, claim.id, {
        status: "failed",
        reportId: null,
        error: input.error,
      });
    }
  } catch (error) {
    console.error("could not record weekly report failure:", clipError(error));
  }
  return {
    projectId: input.projectId,
    projectName: input.projectName,
    status: "failed",
    error: input.error,
  };
}

async function prepareOneStore(
  supabase: Db,
  store: StoreRow,
  period: ScheduledStoreReportPeriod,
): Promise<WeeklyStoreReportResult> {
  const projectId = store.project_id;
  const projectName = projectNameOf(store);
  const fallback = periodWindow(period, WEEKLY_REPORT_TIME_ZONE);
  const access = resolveStoreAccess({
    project_id: projectId,
    shop_domain: store.shop_domain,
    access_token_ciphertext: store.access_token_ciphertext,
    client_id: "",
    client_secret_ciphertext: "",
    scopes: null,
    status: "connected",
    last_error: null,
    last_synced_at: null,
    created_at: "",
    updated_at: "",
  } satisfies ProjectShopifyConnection);

  if ("error" in access) {
    return recordFailure(supabase, {
      projectId,
      projectName,
      period,
      reportKind: "store",
      weekStart: fallback.weekStart,
      weekEnd: fallback.weekEnd,
      error: access.error,
    });
  }

  let weekStart = fallback.weekStart;
  let weekEnd = fallback.weekEnd;
  try {
    const shop = await fetchShop(access.shop, access.accessToken);
    const window = periodWindow(period, shop.timezone || WEEKLY_REPORT_TIME_ZONE);
    weekStart = window.weekStart;
    weekEnd = window.weekEnd;
  } catch (error) {
    return recordFailure(supabase, {
      projectId,
      projectName,
      period,
      reportKind: "store",
      weekStart,
      weekEnd,
      error: clipError(error),
    });
  }

  let claim: { id: string } | "skip";
  try {
    claim = await claimRun(supabase, {
      projectId,
      period,
      reportKind: "store",
      weekStart,
      weekEnd,
    });
  } catch (error) {
    return {
      projectId,
      projectName,
      status: "failed",
      error: clipError(error),
    };
  }
  if (claim === "skip") {
    return { projectId, projectName, status: "skipped" };
  }

  try {
    const existing = await findStoreReportForPeriod(
      supabase,
      projectId,
      weekStart,
      weekEnd,
    );
    if (existing) {
      await finishRun(supabase, claim.id, {
        status: "skipped",
        reportId: existing.id,
        error: null,
      });
      return {
        projectId,
        projectName,
        status: "skipped",
        reportId: existing.id,
      };
    }

    const created = await generateStoreReportDrafts({
      supabase,
      userId: null,
      projectId,
      projectName,
      shop: access.shop,
      accessToken: access.accessToken,
      range: { preset: period === "month" ? "last_month" : "last_week" },
    });

    if ("error" in created) {
      await finishRun(supabase, claim.id, {
        status: "failed",
        reportId: null,
        error: created.error.slice(0, 500),
      });
      return {
        projectId,
        projectName,
        status: "failed",
        error: created.error,
      };
    }

    await finishRun(supabase, claim.id, {
      status: "generated",
      reportId: created.id,
      error: null,
    });
    return {
      projectId,
      projectName,
      status: "generated",
      reportId: created.id,
    };
  } catch (error) {
    const message = clipError(error);
    await finishRun(supabase, claim.id, {
      status: "failed",
      reportId: null,
      error: message,
    });
    return { projectId, projectName, status: "failed", error: message };
  }
}

export async function runScheduledStoreReports(
  supabase: Db,
  period: ScheduledStoreReportPeriod,
  options?: { budgetMs?: number },
): Promise<{
  results: WeeklyStoreReportResult[];
  deferred: number;
}> {
  const started = Date.now();
  const budgetMs = options?.budgetMs ?? START_BUDGET_MS;
  const { data, error } = await supabase
    .from("project_shopify_connections")
    .select("project_id, shop_domain, access_token_ciphertext, projects(name)")
    .not("access_token_ciphertext", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const stores = ((data ?? []) as StoreRow[]).sort((a, b) =>
    projectNameOf(a).localeCompare(projectNameOf(b)),
  );
  const results: WeeklyStoreReportResult[] = [];
  let index = 0;
  let stop = false;

  async function worker() {
    while (!stop && index < stores.length) {
      if (Date.now() - started > budgetMs) {
        stop = true;
        return;
      }
      const store = stores[index];
      index += 1;
      if (!store) return;
      results.push(await prepareOneStore(supabase, store, period));
    }
  }

  const workers = Math.min(CONCURRENCY, stores.length);
  if (workers > 0) {
    await Promise.all(Array.from({ length: workers }, () => worker()));
  }

  const seen = new Set(results.map((result) => result.projectId));
  return {
    results,
    deferred: stores.filter((store) => !seen.has(store.project_id)).length,
  };
}

export function runWeeklyStoreReports(supabase: Db) {
  return runScheduledStoreReports(supabase, "week");
}

export function runMonthlyStoreReports(
  supabase: Db,
  options?: { budgetMs?: number },
) {
  return runScheduledStoreReports(supabase, "month", options);
}

async function findProgressReport(
  supabase: Db,
  projectId: string,
  title: string,
) {
  const { data, error } = await supabase
    .from("project_reports")
    .select("id")
    .eq("project_id", projectId)
    .eq("kind", "progress")
    .eq("title", title)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function prepareOneProgressReport(
  supabase: Db,
  store: StoreRow,
  window: ReturnType<typeof dueGmtMonthWindow>,
): Promise<WeeklyStoreReportResult> {
  const projectId = store.project_id;
  const projectName = projectNameOf(store);

  let claim: { id: string } | "skip";
  try {
    claim = await claimRun(supabase, {
      projectId,
      period: "month",
      reportKind: "progress",
      weekStart: window.startYmd,
      weekEnd: window.endYmd,
    });
  } catch (error) {
    return {
      projectId,
      projectName,
      status: "failed",
      error: clipError(error),
    };
  }
  if (claim === "skip") {
    return { projectId, projectName, status: "skipped" };
  }

  try {
    const existing = await findProgressReport(supabase, projectId, window.title);
    if (existing) {
      await finishRun(supabase, claim.id, {
        status: "skipped",
        reportId: existing.id,
        error: null,
      });
      return {
        projectId,
        projectName,
        status: "skipped",
        reportId: existing.id,
      };
    }

    const created = await createProgressReportDraft({
      supabase,
      userId: null,
      projectId,
      projectName,
      window,
    });
    if ("error" in created) {
      await finishRun(supabase, claim.id, {
        status: "failed",
        reportId: null,
        error: created.error.slice(0, 500),
      });
      return {
        projectId,
        projectName,
        status: "failed",
        error: created.error,
      };
    }

    await finishRun(supabase, claim.id, {
      status: "generated",
      reportId: created.id,
      error: null,
    });
    return {
      projectId,
      projectName,
      status: "generated",
      reportId: created.id,
    };
  } catch (error) {
    const message = clipError(error);
    await finishRun(supabase, claim.id, {
      status: "failed",
      reportId: null,
      error: message,
    });
    return { projectId, projectName, status: "failed", error: message };
  }
}

export async function runMonthlyProgressReports(
  supabase: Db,
  options?: { budgetMs?: number },
) {
  const started = Date.now();
  const budgetMs = options?.budgetMs ?? 90_000;
  const window = dueGmtMonthWindow();
  const { data, error } = await supabase
    .from("project_shopify_connections")
    .select("project_id, shop_domain, access_token_ciphertext, projects(name)")
    .not("access_token_ciphertext", "is", null);
  if (error) throw new Error(error.message);

  const stores = ((data ?? []) as StoreRow[]).sort((a, b) =>
    projectNameOf(a).localeCompare(projectNameOf(b)),
  );
  const results: WeeklyStoreReportResult[] = [];
  let index = 0;
  let stop = false;

  async function worker() {
    while (!stop && index < stores.length) {
      if (Date.now() - started > budgetMs) {
        stop = true;
        return;
      }
      const store = stores[index];
      index += 1;
      if (!store) return;
      results.push(await prepareOneProgressReport(supabase, store, window));
    }
  }

  const workers = Math.min(CONCURRENCY, stores.length);
  if (workers > 0) {
    await Promise.all(Array.from({ length: workers }, () => worker()));
  }

  const seen = new Set(results.map((result) => result.projectId));
  return {
    window: { title: window.title, start: window.startYmd, end: window.endYmd },
    results,
    deferred: stores.filter((store) => !seen.has(store.project_id)).length,
  };
}
