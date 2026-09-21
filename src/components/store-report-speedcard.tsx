import { formatDateTime } from "@/lib/format-date";
import { cwvLabel, formatCls, formatMs, type CwvRating } from "@/lib/pagespeed";
import { pageKindLabel } from "@/lib/store-report-speed";
import type { StoreReportSpeed } from "@/types/database";

function ratingClass(rating: string | null | undefined) {
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

export function StoreReportSpeedcard({ speed }: { speed: StoreReportSpeed }) {
  const originRating = asRating(speed.origin.category);
  const originLabel =
    speed.origin.passed == null
      ? "Not enough Chrome user data yet"
      : speed.origin.passed
        ? "Passes Core Web Vitals"
        : "Does not pass Core Web Vitals";

  return (
    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Site performance</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Lighthouse lab scores from the snapshot on{" "}
        {formatDateTime(speed.captured_at)}. Field figures are real Chrome
        visitors, not the lab test.
      </p>

      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Store origin · real visitors
        </p>
        <p className={`mt-1 font-medium ${ratingClass(originRating)}`}>
          {originLabel}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          LCP {formatMs(speed.origin.lcp_ms)} · INP {formatMs(speed.origin.inp_ms)}{" "}
          · CLS {formatCls(speed.origin.cls)}
          {speed.origin.url
            ? ` · ${speed.origin.url.replace(/^https?:\/\//, "")}`
            : ""}
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="pb-2 font-medium">Page</th>
              <th className="pb-2 font-medium">Lab</th>
              <th className="pb-2 font-medium">Change</th>
              <th className="pb-2 font-medium">Field</th>
            </tr>
          </thead>
          <tbody>
            {speed.pages.map((page) => {
              const fieldRating = asRating(page.field_category);
              return (
                <tr
                  key={`${page.page_kind}-${page.url}`}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-2">
                    <span className="block">{pageKindLabel(page.page_kind)}</span>
                    <span className="block text-xs text-[var(--muted)]">
                      {page.title}
                    </span>
                  </td>
                  <td className="py-2 tabular-nums">
                    {page.error
                      ? "Unavailable"
                      : page.lab_score != null
                        ? page.lab_score
                        : "—"}
                  </td>
                  <td className="py-2 tabular-nums">
                    {page.lab_score_change == null
                      ? "—"
                      : `${page.lab_score_change > 0 ? "+" : ""}${page.lab_score_change}`}
                  </td>
                  <td className={`py-2 ${ratingClass(fieldRating)}`}>
                    {page.field_lcp_ms != null || page.field_cls != null
                      ? `${cwvLabel(fieldRating)}${
                          page.field_passed == null
                            ? ""
                            : page.field_passed
                              ? " · pass"
                              : " · fail"
                        }`
                      : "No field data"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
