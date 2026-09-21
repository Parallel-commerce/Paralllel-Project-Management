import { AdminOnly } from "@/components/admin-only";
import { RefreshStoreSpeedButton } from "@/components/refresh-store-speed-button";
import { formatDateTime } from "@/lib/format-date";
import {
  cwvLabel,
  formatCls,
  formatMs,
  type CwvRating,
} from "@/lib/pagespeed";
import type {
  ProjectStoreSpeedPage,
  ProjectStoreSpeedRun,
  SpeedPageKind,
} from "@/types/database";

const PAGE_ORDER: SpeedPageKind[] = ["home", "collection", "product", "cart"];

const PAGE_LABEL: Record<SpeedPageKind, string> = {
  home: "Homepage",
  collection: "Collection",
  product: "Product",
  cart: "Cart",
};

function ratingClass(rating: CwvRating | string | null | undefined) {
  if (rating === "good") return "text-[var(--status-done-label)]";
  if (rating === "poor") return "text-[var(--danger)]";
  if (rating === "needs_improvement") return "text-[var(--status-feedback-label)]";
  return "text-[var(--muted)]";
}

function asRating(value: string | null | undefined): CwvRating | null {
  if (value === "good" || value === "needs_improvement" || value === "poor") {
    return value;
  }
  return null;
}

function pageLabel(page: ProjectStoreSpeedPage) {
  if (page.page_kind === "collection" || page.page_kind === "product") {
    return page.title || PAGE_LABEL[page.page_kind];
  }
  return PAGE_LABEL[page.page_kind];
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

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Core Web Vitals</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Mobile PageSpeed for the homepage, a collection, a product, and cart.
            Field data is real Chrome users when Google has enough traffic; lab
            scores are Lighthouse.
          </p>
        </div>
        {canRefresh ? (
          <AdminOnly variant="inline">
            <RefreshStoreSpeedButton projectId={projectId} />
          </AdminOnly>
        ) : null}
      </div>

      {!run ? (
        <p className="mt-4 text-sm text-[var(--muted)]">
          {canRefresh
            ? "No speed snapshot yet. Refresh speed to capture the first run. It takes a minute or two."
            : "Speed snapshots will appear here once your Parallel team captures them."}
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Store origin · field data
            </p>
            <p className={`mt-1 font-medium ${ratingClass(originRating)}`}>
              {run.origin_passed == null
                ? "Not enough Chrome user data yet"
                : run.origin_passed
                  ? "Passes Core Web Vitals"
                  : "Does not pass Core Web Vitals"}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              LCP {formatMs(run.origin_lcp_ms)} · INP {formatMs(run.origin_inp_ms)} ·
              CLS {formatCls(run.origin_cls)}
              {run.origin_url ? ` · ${run.origin_url.replace(/^https?:\/\//, "")}` : ""}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Updated {formatDateTime(run.captured_at)}
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {ordered.map((page) => {
              const fieldRating = asRating(page.field_category);
              const hasField = page.field_lcp_ms != null || page.field_cls != null;
              return (
                <article
                  key={page.id}
                  className="rounded-lg border border-[var(--border)] px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    {PAGE_LABEL[page.page_kind]}
                  </p>
                  <p className="mt-1 font-medium">{pageLabel(page)}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                    {page.url.replace(/^https?:\/\//, "")}
                  </p>
                  {page.error ? (
                    <p className="mt-2 text-sm text-[var(--danger)]">{page.error}</p>
                  ) : (
                    <>
                      <p className="mt-2 font-display text-2xl tracking-tight">
                        {page.performance_score != null
                          ? page.performance_score
                          : "—"}
                        <span className="ml-1 text-sm font-sans text-[var(--muted)]">
                          lab
                        </span>
                      </p>
                      <p className={`mt-1 text-sm ${ratingClass(fieldRating)}`}>
                        {hasField
                          ? `Field ${cwvLabel(fieldRating)}${
                              page.field_passed == null
                                ? ""
                                : page.field_passed
                                  ? " · pass"
                                  : " · fail"
                            }`
                          : "No URL-level field data"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {hasField
                          ? `LCP ${formatMs(page.field_lcp_ms)} · INP ${formatMs(page.field_inp_ms)} · CLS ${formatCls(page.field_cls)}`
                          : `Lab LCP ${formatMs(page.lab_lcp_ms)} · TBT ${formatMs(page.lab_tbt_ms)} · CLS ${formatCls(page.lab_cls)}`}
                      </p>
                      {page.opportunities?.length ? (
                        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-[var(--muted)]">
                          {page.opportunities.slice(0, 3).map((item) => (
                            <li key={item.id || item.title}>
                              {item.title}
                              {item.savings_ms
                                ? ` (${formatMs(item.savings_ms)})`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
