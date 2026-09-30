import Link from "next/link";

export function CrmNav({
  active,
}: {
  active: "prospects" | "companies";
}) {
  const itemClass = (isActive: boolean) =>
    `min-h-10 rounded-md border px-3 py-2 text-sm transition ${
      isActive
        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
        : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
    }`;

  return (
    <nav aria-label="CRM" className="flex flex-wrap items-center gap-2">
      <Link href="/crm" className={itemClass(active === "prospects")}>
        Prospects
      </Link>
      <Link
        href="/crm/companies"
        className={itemClass(active === "companies")}
      >
        Companies
      </Link>
    </nav>
  );
}
