"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  crmHref,
  KIND_TABS,
  STATUS_TABS,
  type KindTab,
  type StatusTab,
  type VerticalTab,
} from "@/lib/crm-filters";
import type { VerticalOption } from "@/lib/verticals";

function FilterSelect({
  label,
  value,
  options,
  active,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  active: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  const selected =
    options.find((option) => option.id === value)?.label ?? value;

  return (
    <label
      className={`relative flex min-h-9 min-w-0 cursor-pointer items-center gap-2 px-3 py-1.5 transition sm:min-w-[13rem] ${
        active
          ? "bg-[var(--accent-soft)]"
          : "bg-[var(--surface)] hover:bg-white"
      } ${className}`}
    >
      <span
        className={`shrink-0 text-xs ${
          active ? "text-[var(--accent)]" : "text-[var(--muted)]"
        }`}
      >
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-sm font-medium ${
          active ? "text-[var(--accent)]" : "text-[var(--foreground)]"
        }`}
      >
        {selected}
      </span>
      <span
        aria-hidden
        className={`shrink-0 text-xs ${
          active ? "text-[var(--accent)]" : "text-[var(--muted)]"
        }`}
      >
        ▾
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CrmFilters({
  status,
  kind,
  vertical,
  verticals,
}: {
  status: StatusTab;
  kind: KindTab;
  vertical: VerticalTab;
  verticals: VerticalOption[];
}) {
  const router = useRouter();
  const filtered = kind !== "all" || status !== "all" || vertical !== "all";
  const verticalOptions = [
    { id: "all", label: "All" },
    ...verticals.map((item) => ({ id: item.id, label: item.name })),
  ];

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 sm:mt-6">
      <div className="grid w-full min-w-0 grid-cols-1 overflow-hidden rounded-lg border border-[var(--border)] sm:inline-grid sm:w-auto sm:grid-cols-3">
        <FilterSelect
          label="Type"
          value={kind}
          options={KIND_TABS}
          active={kind !== "all"}
          onChange={(value) =>
            router.push(crmHref(status, value as KindTab, vertical))
          }
        />
        <FilterSelect
          label="Stage"
          value={status}
          options={STATUS_TABS}
          active={status !== "all"}
          className="border-t border-[var(--border)] sm:border-l sm:border-t-0"
          onChange={(value) =>
            router.push(crmHref(value as StatusTab, kind, vertical))
          }
        />
        <FilterSelect
          label="Vertical"
          value={vertical}
          options={verticalOptions}
          active={vertical !== "all"}
          className="border-t border-[var(--border)] sm:border-l sm:border-t-0"
          onChange={(value) =>
            router.push(crmHref(status, kind, value as VerticalTab))
          }
        />
      </div>
      {filtered ? (
        <Link
          href="/crm"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
        >
          Clear
        </Link>
      ) : null}
    </div>
  );
}