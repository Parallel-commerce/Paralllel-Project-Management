import { formatDate, formatDateTime } from "@/lib/format-date";
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

function trendClass(trend: ScorecardTrend | undefined) {
  if (trend === "up") return "text-[var(--status-done-label)]";
  if (trend === "down") return "text-[var(--danger)]";
  return "text-[var(--muted)]";
}

function StatCard({
  label,
  value,
  hint,
  hintTrend,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTrend?: ScorecardTrend;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl tracking-tight">{value}</p>
      {hint ? (
        <p className={`mt-1 text-xs ${trendClass(hintTrend)}`}>{hint}</p>
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
  const salesHint = snapshot.sales_available
    ? undefined
    : "Sales need the read_orders scope on the custom app.";
  const daily = uniqueDailySnapshots(history?.length ? history : [snapshot]);
  const latestDaily = daily[0] ?? null;
  const previousDaily = daily[1] ?? null;

  function dayHint(key: SnapshotMetricKey, salesMetric: boolean) {
    if (salesMetric && !snapshot.sales_available) {
      return {
        hint: salesHint,
        hintTrend: undefined as ScorecardTrend | undefined,
      };
    }
    if (!latestDaily) return { hint: undefined, hintTrend: undefined };
    const copy = vsPreviousDayCopy(
      snapshotChangePct(latestDaily, previousDaily, key),
    );
    return { hint: copy?.label, hintTrend: copy?.trend };
  }

  const orders1d = dayHint("orders_1d", false);
  const sales1d = dayHint("sales_1d", true);
  const dayLabel = latestDaily?.snapshot_date
    ? formatDate(latestDaily.snapshot_date)
    : "Yesterday";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">{snapshot.shop_name ?? "Shopify store"}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {snapshot.primary_domain?.replace(/^https?:\/\//, "") ??
              snapshot.shop_domain}
            {snapshot.plan_name ? ` · ${snapshot.plan_name}` : ""}
          </p>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Updated {formatDateTime(snapshot.captured_at)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label={`Orders · ${dayLabel}`}
          value={
            latestDaily ? formatCount(latestDaily.orders_1d) : "—"
          }
          hint={
            latestDaily
              ? orders1d.hint
              : "The first daily snapshot appears after midnight, or after Sync now."
          }
          hintTrend={orders1d.hintTrend}
        />
        <StatCard
          label={`Sales · ${dayLabel}`}
          value={
            latestDaily
              ? formatMoney(latestDaily.sales_1d, latestDaily.currency ?? snapshot.currency)
              : "—"
          }
          hint={sales1d.hint}
          hintTrend={sales1d.hintTrend}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Orders · 7 days"
          value={formatCount(snapshot.orders_7d)}
        />
        <StatCard
          label="Sales · 7 days"
          value={formatMoney(snapshot.sales_7d, snapshot.currency)}
          hint={salesHint}
        />
        <StatCard
          label="Orders · 30 days"
          value={formatCount(snapshot.orders_30d)}
        />
        <StatCard
          label="Sales · 30 days"
          value={formatMoney(snapshot.sales_30d, snapshot.currency)}
          hint={salesHint}
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Live theme
        </p>
        <p className="mt-2 font-medium">{snapshot.theme_name ?? "—"}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {snapshot.theme_updated_at
            ? `Last updated ${formatDateTime(snapshot.theme_updated_at)}`
            : "No published theme details yet."}
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        <h3 className="font-medium">Daily snapshots</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          One row per completed shop day, captured automatically after midnight.
          Figures are that day’s orders and sales, not a rolling week.
        </p>
        {daily.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            No daily snapshots yet. Sync now will record yesterday, and the
            nightly job will keep the series going.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="pb-2 font-medium">Day</th>
                  <th className="pb-2 font-medium">Orders</th>
                  <th className="pb-2 font-medium">Sales</th>
                  <th className="pb-2 font-medium">vs previous day</th>
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
                      <td className="py-2">
                        {row.snapshot_date
                          ? formatDate(row.snapshot_date)
                          : formatDateTime(row.captured_at)}
                      </td>
                      <td className="py-2">{formatCount(row.orders_1d)}</td>
                      <td className="py-2">
                        {row.sales_available
                          ? formatMoney(
                              row.sales_1d,
                              row.currency ?? snapshot.currency,
                            )
                          : "—"}
                      </td>
                      <td className={`py-2 ${trendClass(change?.trend)}`}>
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
