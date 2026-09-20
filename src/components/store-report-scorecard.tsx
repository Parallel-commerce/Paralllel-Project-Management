import {
  formatChangePct,
  formatStoreMoney,
  formatStoreNumber,
  formatStorePercent,
  formatStoreRange,
  trendDot,
} from "@/lib/store-report";
import type { StoreReportDigest } from "@/types/database";

function formatMetric(
  value: number | null,
  format: "money" | "count" | "percent",
  currency: string | null,
) {
  if (value == null) return "Unavailable";
  if (format === "money") return formatStoreMoney(value, currency);
  if (format === "percent") return formatStorePercent(value);
  return formatStoreNumber(value);
}

export function StoreReportScorecard({ digest }: { digest: StoreReportDigest }) {
  const period = digest.period ?? "week";
  const currentLabel =
    period === "month" ? "This month" : period === "custom" ? "This period" : "This week";
  const previousLabel =
    period === "month" ? "Last month" : period === "custom" ? "Previous" : "Last week";
  const scoreLabel =
    period === "month"
      ? "Monthly performance score"
      : period === "custom"
        ? "Performance score"
        : "Weekly performance score";

  return (
    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Scorecard</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {digest.shop_name ?? "Store"} ·{" "}
        {formatStoreRange(digest.week_start, digest.week_end)}
        {digest.currency ? ` · ${digest.currency}` : ""}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="pb-2 font-medium">Metric</th>
              <th className="pb-2 font-medium">{currentLabel}</th>
              <th className="pb-2 font-medium">{previousLabel}</th>
              <th className="pb-2 font-medium">Change</th>
              <th className="pb-2 font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {digest.scorecard.metrics.map((metric) => (
              <tr key={metric.key} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2">{metric.label}</td>
                <td className="py-2">
                  {formatMetric(metric.this_week, metric.format, digest.currency)}
                </td>
                <td className="py-2">
                  {formatMetric(metric.last_week, metric.format, digest.currency)}
                </td>
                <td className="py-2">{formatChangePct(metric.change_pct)}</td>
                <td className="py-2">{trendDot(metric.trend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm">
        <span className="font-medium">
          {scoreLabel}: {digest.scorecard.score}%
        </span>
        <span className="mt-1 block text-[var(--muted)]">
          {digest.scorecard.interpretation}
        </span>
      </p>
    </section>
  );
}
