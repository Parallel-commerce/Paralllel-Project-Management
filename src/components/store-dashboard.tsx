import { DailySnapshotPages } from "@/components/daily-snapshot-pages";
import { formatDate, formatDateTime, formatDayMonth } from "@/lib/format-date";
import {
  snapshotChangePct,
  snapshotNumber,
  uniqueDailySnapshots,
  vsPreviousDayCopy,
  type SnapshotMetricKey,
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
  const previousDaily = daily[1] ?? null;
  const yesterdayDate = latestDaily?.snapshot_date
    ? formatDayMonth(latestDaily.snapshot_date)
    : null;

  function yesterdayHint(key: SnapshotMetricKey) {
    if (!latestDaily || !previousDaily) return undefined;
    return vsPreviousDayCopy(
      snapshotChangePct(latestDaily, previousDaily, key),
    );
  }

  const ordersHint = yesterdayHint("orders_1d");
  const salesHintDay = yesterdayHint("sales_1d");
  const sessionsHint = yesterdayHint("sessions_1d");
  const conversionHint = yesterdayHint("conversion_rate_1d");

  const rows = [
    {
      label: "Orders",
      yesterday: latestDaily ? formatCount(latestDaily.orders_1d) : "—",
      week: formatCount(snapshot.orders_7d),
      month: formatCount(snapshot.orders_30d),
      hint: ordersHint?.label,
      hintTrend: ordersHint?.trend,
    },
    {
      label: "Sales",
      yesterday: latestDaily
        ? formatMoney(latestDaily.sales_1d, latestDaily.currency ?? currency)
        : "—",
      week: formatMoney(snapshot.sales_7d, currency),
      month: formatMoney(snapshot.sales_30d, currency),
      hint: salesHintDay?.label,
      hintTrend: salesHintDay?.trend,
    },
    {
      label: "Sessions",
      yesterday: latestDaily ? formatCount(latestDaily.sessions_1d) : "—",
      week: formatCount(snapshot.sessions_7d),
      month: formatCount(snapshot.sessions_30d),
      hint: sessionsHint?.label,
      hintTrend: sessionsHint?.trend,
    },
    {
      label: "Conversion",
      yesterday: latestDaily
        ? formatPercent(latestDaily.conversion_rate_1d)
        : "—",
      week: formatPercent(snapshot.conversion_rate_7d),
      month: formatPercent(snapshot.conversion_rate_30d),
      hint: conversionHint?.label,
      hintTrend: conversionHint?.trend,
    },
  ];

  const periods = [
    {
      label: "Yesterday",
      sub: yesterdayDate,
      values: rows.map((row) => ({
        label: row.label,
        value: row.yesterday,
        hint: row.hint,
        hintTrend: row.hintTrend,
      })),
    },
    {
      label: "7 days",
      sub: null as string | null,
      values: rows.map((row) => ({
        label: row.label,
        value: row.week,
        hint: undefined as string | undefined,
        hintTrend: undefined as ScorecardTrend | undefined,
      })),
    },
    {
      label: "30 days",
      sub: null as string | null,
      values: rows.map((row) => ({
        label: row.label,
        value: row.month,
        hint: undefined as string | undefined,
        hintTrend: undefined as ScorecardTrend | undefined,
      })),
    },
  ];

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
            <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
              <h3 className="font-display text-lg tracking-tight">
                {period.label}
              </h3>
              {period.sub ? (
                <p className="text-xs text-[var(--muted)]">{period.sub}</p>
              ) : null}
            </div>
            <dl className="px-4 pt-1 pb-3">
              {period.values.map((metric) => (
                <div
                  key={metric.label}
                  className="flex items-baseline justify-between gap-3 border-b border-[var(--border)]/80 py-1.5 last:border-0"
                >
                  <dt className="text-xs text-[var(--muted)]">{metric.label}</dt>
                  <dd className="text-right">
                    <span className="font-display text-lg tracking-tight tabular-nums">
                      {metric.value}
                    </span>
                    {metric.hint ? (
                      <span
                        className={`ml-2 text-xs tabular-nums ${trendClass(metric.hintTrend)}`}
                      >
                        {metric.hint}
                      </span>
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
