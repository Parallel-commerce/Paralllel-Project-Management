import { formatDateTime } from "@/lib/format-date";
import type { ProjectStoreSnapshot } from "@/types/database";

function asNumber(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(
  amount: number | string | null | undefined,
  currency: string | null,
) {
  const value = asNumber(amount);
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
  const parsed = asNumber(value);
  if (parsed == null) return "—";
  return new Intl.NumberFormat("en-GB").format(parsed);
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl tracking-tight">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function StoreDashboard({
  snapshot,
}: {
  snapshot: ProjectStoreSnapshot;
}) {
  const salesHint = snapshot.sales_available
    ? undefined
    : "Sales need the read_orders scope on the custom app.";

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
    </section>
  );
}
