import { AdminOnly } from "@/components/admin-only";
import { RefreshStoreSpeedButton } from "@/components/refresh-store-speed-button";
import { formatDateTime } from "@/lib/format-date";
import { formatCls, formatMs, type CwvRating } from "@/lib/pagespeed";
import type {
  ProjectStoreSpeedPage,
  ProjectStoreSpeedRun,
  SpeedPageKind,
} from "@/types/database";

const PAGE_ORDER: SpeedPageKind[] = ["home", "collection", "product", "cart"];

const PAGE_LABEL: Record<SpeedPageKind, string> = {
  home: "Home",
  collection: "Collection",
  product: "Product",
  cart: "Cart",
};

function asRating(value: string | null | undefined): CwvRating | null {
  if (value === "good" || value === "needs_improvement" || value === "poor") {
    return value;
  }
  return null;
}

function labRating(score: number | null): CwvRating | null {
  if (score == null) return null;
  if (score >= 90) return "good";
  if (score >= 50) return "needs_improvement";
  return "poor";
}

function ratingInk(rating: CwvRating | null) {
  if (rating === "good") return "text-[var(--status-done-label)]";
  if (rating === "poor") return "text-[var(--danger)]";
  if (rating === "needs_improvement") return "text-[var(--status-feedback-label)]";
  return "text-[var(--foreground)]";
}

function ratingWash(rating: CwvRating | null) {
  if (rating === "good") return "bg-[var(--status-done-bg)]";
  if (rating === "poor") return "bg-[color-mix(in_srgb,var(--danger)_10%,white)]";
  if (rating === "needs_improvement") return "bg-[var(--status-feedback-bg)]";
  return "bg-[var(--surface)]";
}

function pageTitle(page: ProjectStoreSpeedPage) {
  if (page.page_kind === "collection" || page.page_kind === "product") {
    return page.title || null;
  }
  return null;
}

export function StoreSpeedPanel({
  projectId,
  run,
  pages,
  canRefresh,
}: {
  projectId: string;
  run: ProjectStoreSpeedRun | null;
  pages: ProjectStoreSpeedPage[];
  canRefresh: boolean;
}) {
  const ordered = [...pages].sort(
    (a, b) => PAGE_ORDER.indexOf(a.page_kind) - PAGE_ORDER.indexOf(b.page_kind),
  );
  const originRating = asRating(run?.origin_category);
  const passed = run?.origin_passed;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display text-lg tracking-tight">Core Web Vitals</h3>
          {run ? (
            <p className={`text-sm font-medium ${ratingInk(originRating)}`}>
              {passed == null
                ? "Not enough field data"
                : passed
                  ? "Passes"
                  : "Fails"}
            </p>
          ) : null}
          {run ? (
            <p className="text-xs tabular-nums text-[var(--muted)]">
              LCP {formatMs(run.origin_lcp_ms)} · INP {formatMs(run.origin_inp_ms)} ·
              CLS {formatCls(run.origin_cls)}
              {" · "}
              {formatDateTime(run.captured_at)}
            </p>
          ) : null}
        </div>
        {canRefresh ? (
          <AdminOnly variant="inline">
            <RefreshStoreSpeedButton projectId={projectId} />
          </AdminOnly>
        ) : null}
      </div>

      {!run ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {canRefresh
            ? "No speed snapshot yet. Refresh speed to capture the first run."
            : "Speed snapshots will appear here once your Parallel team captures them."}
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {ordered.map((page) => {
            const score = page.performance_score;
            const band = labRating(score);
            const title = pageTitle(page);
            const hasField = page.field_lcp_ms != null || page.field_cls != null;
            const lcp = hasField ? page.field_lcp_ms : page.lab_lcp_ms;
            const cls = hasField ? page.field_cls : page.lab_cls;
            return (
              <article
                key={page.id}
                className={`rounded-xl px-3 py-2.5 ${ratingWash(band)}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                    {PAGE_LABEL[page.page_kind]}
                  </p>
                  {page.field_passed == null ? null : (
                    <p className={`text-[11px] font-medium ${ratingInk(asRating(page.field_category))}`}>
                      {page.field_passed ? "Pass" : "Fail"}
                    </p>
                  )}
                </div>
                {page.error ? (
                  <p className="mt-1 text-sm text-[var(--danger)]">{page.error}</p>
                ) : (
                  <>
                    <p
                      className={`mt-1 font-display text-4xl leading-none tracking-tight tabular-nums ${ratingInk(band)}`}
                    >
                      {score ?? "—"}
                    </p>
                    {title ? (
                      <p className="mt-1 h-4 truncate text-xs text-[var(--foreground)]">
                        {title}
                      </p>
                    ) : (
                      <p className="mt-1 h-4" aria-hidden="true" />
                    )}
                    <p className="mt-1.5 text-[11px] tabular-nums text-[var(--muted)]">
                      LCP {formatMs(lcp)}
                      {hasField ? ` · INP ${formatMs(page.field_inp_ms)}` : ""}
                      {" · "}CLS {formatCls(cls)}
                    </p>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
