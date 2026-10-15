import { DailySnapshotPages } from "@/components/daily-snapshot-pages";
import { formatDate, formatDateTime, formatDayMonth } from "@/lib/format-date";
import { shiftYmdYears } from "@/lib/store-report";
import {
  snapshotChangePct,
  snapshotNumber,
  uniqueDailySnapshots,
  vsPreviousDayCopy,
  yearAgoComparison,
} from "@/lib/store-snapshot";
import type { ProjectStoreSnapshot, ScorecardTrend } from "@/types/database";

function formatMoney(
  amount: number | string | null | undefined,
  currency: string | null,
) {
  const value = snapshotNumber(amount);
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function formatCount(value: number | string | null | undefined) {
  const parsed = snapshotNumber(value);
  if (parsed == null) return "—";
  return new Intl.NumberFormat("en-GB").format(parsed);
}

function formatPercent(value: number | string | null | undefined) {
  const parsed = snapshotNumber(value);
  if (parsed == null) return "—";
  return `${new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 1,
  }).format(parsed)}%`;
}

function trendClass(trend: ScorecardTrend | undefined) {
  if (trend === "up") return "text-[var(--status-done-label)]";
  if (trend === "down") return "text-[var(--danger)]";
  return "text-[var(--muted)]";
}

function periodMetric(
  label: string,
  current: number | string | null | undefined,
  prior: number | string | null | undefined,
  format: (value: number | string | null | undefined) => string,
) {
  const comparison = yearAgoComparison(current, prior);
  return {
    label,
    value: current == null ? "—" : format(current),
    prior: comparison.prior == null ? null : format(prior),
    change: comparison.change,
  };
}

export function StoreDashboard({
  snapshot,
  history,
}: {
  snapshot: ProjectStoreSnapshot;
  history?: ProjectStoreSnapshot[];
}) {
  const currency = snapshot.currency;
  const salesHint = snapshot.sales_available
    ? undefined
    : "Sales need the read_orders scope on the custom app.";
  const reportsHint =
    snapshot.reports_available === false
      ? "Sessions and conversion need read_reports. Add it on the custom app, then reconnect."
      : undefined;
  const daily = uniqueDailySnapshots(history?.length ? history : [snapshot]);
  const latestDaily = daily[0] ?? null;
  const yesterdayDate = latestDaily?.snapshot_date
    ? formatDayMonth(latestDaily.snapshot_date)
    : null;
  const yesterdayLastYear = latestDaily?.snapshot_date
    ? formatDate(shiftYmdYears(latestDaily.snapshot_date, -1))
    : null;
  const dayMoney = (value: number | string | null | undefined) =>
    formatMoney(value, latestDaily?.currency ?? currency);
  const weekMoney = (value: number | string | null | undefined) =>
    formatMoney(value, currency);

  const periods = [
    {
      label: "Yesterday",
      sub: yesterdayDate,
      compare: yesterdayLastYear ? `vs ${yesterdayLastYear}` : null,
      values: [
        periodMetric(
          "Orders",
          latestDaily?.orders_1d,
          latestDaily?.orders_1d_prev_year,
          formatCount,
        ),
        periodMetric(
          "Sales",
          latestDaily?.sales_1d,
          latestDaily?.sales_1d_prev_year,
          dayMoney,
        ),
        periodMetric(
          "Sessions",
          latestDaily?.sessions_1d,
          latestDaily?.sessions_1d_prev_year,
          formatCount,
        ),
        periodMetric(
          "Conversion",
          latestDaily?.conversion_rate_1d,
          latestDaily?.conversion_rate_1d_prev_year,
          formatPercent,
        ),
      ],
    },
    {
      label: "7 days",
      sub: null as string | null,
      compare: "vs last year",
      values: [
        periodMetric(
          "Orders",
          snapshot.orders_7d,
          snapshot.orders_7d_prev_year,
          formatCount,
        ),
        periodMetric(
          "Sales",
          snapshot.sales_7d,
          snapshot.sales_7d_prev_year,
          weekMoney,
        ),
        periodMetric(
          "Sessions",
          snapshot.sessions_7d,
          snapshot.sessions_7d_prev_year,
          formatCount,
        ),
        periodMetric(
          "Conversion",
          snapshot.conversion_rate_7d,
          snapshot.conversion_rate_7d_prev_year,
          formatPercent,
        ),
      ],
    },
    {
      label: "30 days",
      sub: null as string | null,
      compare: "vs last year",
      values: [
        periodMetric(
          "Orders",
          snapshot.orders_30d,
          snapshot.orders_30d_prev_year,
          formatCount,
        ),
        periodMetric(
          "Sales",
          snapshot.sales_30d,
          snapshot.sales_30d_prev_year,
          weekMoney,
        ),
        periodMetric(
          "Sessions",
          snapshot.sessions_30d,
          snapshot.sessions_30d_prev_year,
          formatCount,
        ),
        periodMetric(
          "Conversion",
          snapshot.conversion_rate_30d,
          snapshot.conversion_rate_30d_prev_year,
          formatPercent,
        ),
      ],
    },
  ];
  const hasYearAgo = periods.some((period) =>
    period.values.some((metric) => metric.prior != null),
  );

  const domain =
    snapshot.primary_domain?.replace(/^https?:\/\//, "") ?? snapshot.shop_domain;
  const shopMeta = [
    domain,
    snapshot.plan_name,
    snapshot.theme_name,
  ].filter(Boolean);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-[var(--muted)]">
          <span className="font-medium text-[var(--foreground)]">
            {snapshot.shop_name ?? "Shopify store"}
          </span>
          {shopMeta.length > 0 ? ` · ${shopMeta.join(" · ")}` : null}
        </p>
        <p className="text-xs text-[var(--muted)]">
          Updated {formatDateTime(snapshot.captured_at)}
        </p>
      </div>

      <div className="grid overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] sm:grid-cols-3">
        {periods.map((period, index) => (
          <section
            key={period.label}
            aria-label={period.label}
            className={
              index === 0
                ? "bg-[var(--accent-soft)]"
                : "border-t border-[var(--border)] sm:border-t-0 sm:border-l"
            }
          >
            <div className="px-4 pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg tracking-tight">
                  {period.label}
                </h3>
                {period.sub ? (
                  <p className="text-xs text-[var(--muted)]">{period.sub}</p>
                ) : null}
              </div>
              {period.compare &&
              period.values.some((metric) => metric.prior != null) ? (
                <p className="text-[11px] text-[var(--muted)]">{period.compare}</p>
              ) : null}
            </div>
            <dl className="px-4 pt-1 pb-3">
              {period.values.map((metric) => (
                <div
                  key={metric.label}
                  className="flex items-baseline justify-between gap-3 border-b border-[var(--border)]/80 py-1.5 last:border-0"
                >
                  <dt className="text-xs text-[var(--muted)]">{metric.label}</dt>
                  <dd
                    className="text-right"
                    aria-label={
                      metric.prior
                        ? `${metric.label}: ${metric.value}. Last year: ${metric.prior}${metric.change ? `. ${metric.change.label}` : ""}`
                        : undefined
                    }
                  >
                    <div className="font-display text-lg leading-tight tracking-tight tabular-nums">
                      {metric.value}
                    </div>
                    {metric.prior ? (
                      <div className="flex flex-wrap items-baseline justify-end gap-x-1.5 text-[11px] leading-4 tabular-nums">
                        <span className="whitespace-nowrap text-[var(--muted)]">
                          {metric.prior}
                        </span>
                        {metric.change ? (
                          <span
                            className={`whitespace-nowrap ${trendClass(metric.change.trend)}`}
                          >
                            {metric.change.label}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="text-xs text-[var(--muted)]">
        Orders and sales are Online Store only. POS and other channels stay in
        reports.
        {hasYearAgo
          ? " The smaller figure under each total is the same period last year."
          : " Year-on-year figures appear after the next sync from Settings."}
      </p>

      {(salesHint || reportsHint) && (
        <p className="text-sm text-[var(--muted)]">
          {[salesHint, reportsHint].filter(Boolean).join(" ")}
        </p>
      )}

      {!latestDaily ? (
        <p className="text-sm text-[var(--muted)]">
          The first daily snapshot appears after midnight, or after a sync from
          Settings.
        </p>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <h3 className="font-medium">Daily snapshots</h3>
        {daily.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            No daily snapshots yet. Sync now in Settings records yesterday, and
            the nightly job keeps the series going.
          </p>
        ) : (
          <DailySnapshotPages
            rows={daily.map((row, index) => {
              const previous = daily[index + 1];
              const change = vsPreviousDayCopy(
                snapshotChangePct(row, previous, "sales_1d"),
              );
              return {
                id: row.id,
                day: row.snapshot_date
                  ? formatDate(row.snapshot_date)
                  : formatDateTime(row.captured_at),
                orders: formatCount(row.orders_1d),
                sales: row.sales_available
                  ? formatMoney(row.sales_1d, row.currency ?? snapshot.currency)
                  : "—",
                sessions: formatCount(row.sessions_1d),
                conversion: formatPercent(row.conversion_rate_1d),
                change: previous ? (change?.label ?? "—") : null,
                trend: change?.trend,
              };
            })}
          />
        )}
      </div>
    </section>
  );
}
