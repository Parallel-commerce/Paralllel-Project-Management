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

function PeriodValue({
  value,
  hint,
  hintTrend,
}: {
  value: string;
  hint?: string;
  hintTrend?: ScorecardTrend;
}) {
  return (
    <div>
      <p className="font-display text-xl tracking-tight">{value}</p>
      {hint ? (
        <p className={`mt-0.5 text-xs ${trendClass(hintTrend)}`}>{hint}</p>
      ) : null}
    </div>
  );
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">{snapshot.shop_name ?? "Shopify store"}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {shopMeta.join(" · ")}
          </p>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Updated {formatDateTime(snapshot.captured_at)}
        </p>
      </div>

      <div className="grid gap-2 sm:hidden">
        {periods.map((period) => (
          <div
            key={period.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
          >
            <p className="text-sm font-medium">
              {period.label}
              {period.sub ? (
                <span className="font-normal text-[var(--muted)]">
                  {" "}
                  · {period.sub}
                </span>
              ) : null}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
              {period.values.map((metric) => (
                <div key={metric.label}>
                  <p className="text-xs text-[var(--muted)]">{metric.label}</p>
                  <PeriodValue
                    value={metric.value}
                    hint={metric.hint}
                    hintTrend={metric.hintTrend}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden max-w-3xl overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] sm:block">
        <table className="w-full min-w-[28rem] text-left">
          <caption className="sr-only">
            Online Store metrics for yesterday, the last 7 days, and the last 30
            days
          </caption>
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="w-28 px-4 py-3" scope="col">
                <span className="sr-only">Metric</span>
              </th>
              <th className="px-4 py-3 align-top" scope="col">
                <span className="block text-sm font-medium">Yesterday</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {yesterdayDate ?? "—"}
                </span>
              </th>
              <th className="px-4 py-3 align-top" scope="col">
                <span className="block text-sm font-medium">7 days</span>
              </th>
              <th className="px-4 py-3 align-top" scope="col">
                <span className="block text-sm font-medium">30 days</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-[var(--border)] last:border-0"
              >
                <th
                  className="px-4 py-2.5 text-sm font-medium text-[var(--muted)]"
                  scope="row"
                >
                  {row.label}
                </th>
                <td className="px-4 py-2.5">
                  <PeriodValue
                    value={row.yesterday}
                    hint={row.hint}
                    hintTrend={row.hintTrend}
                  />
                </td>
                <td className="px-4 py-2.5">
                  <PeriodValue value={row.week} />
                </td>
                <td className="px-4 py-2.5">
                  <PeriodValue value={row.month} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          The first daily snapshot appears after midnight, or after Sync now.
        </p>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <h3 className="font-medium">Daily snapshots</h3>
        {daily.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            No daily snapshots yet. Sync now will record yesterday, and the
            nightly job will keep the series going.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="py-1.5 pr-3 font-medium">Day</th>
                  <th className="py-1.5 pr-3 font-medium">Orders</th>
                  <th className="py-1.5 pr-3 font-medium">Sales</th>
                  <th className="py-1.5 pr-3 font-medium">Sessions</th>
                  <th className="py-1.5 pr-3 font-medium">Conversion</th>
                  <th className="py-1.5 font-medium">vs previous</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row, index) => {
                  const previous = daily[index + 1];
                  const change = vsPreviousDayCopy(
                    snapshotChangePct(row, previous, "sales_1d"),
                  );
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="py-1.5 pr-3">
                        {row.snapshot_date
                          ? formatDate(row.snapshot_date)
                          : formatDateTime(row.captured_at)}
                      </td>
                      <td className="py-1.5 pr-3">{formatCount(row.orders_1d)}</td>
                      <td className="py-1.5 pr-3">
                        {row.sales_available
                          ? formatMoney(
                              row.sales_1d,
                              row.currency ?? snapshot.currency,
                            )
                          : "—"}
                      </td>
                      <td className="py-1.5 pr-3">
                        {formatCount(row.sessions_1d)}
                      </td>
                      <td className="py-1.5 pr-3">
                        {formatPercent(row.conversion_rate_1d)}
                      </td>
                      <td className={`py-1.5 ${trendClass(change?.trend)}`}>
                        {previous ? (change?.label ?? "—") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
