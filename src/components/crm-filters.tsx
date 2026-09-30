"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  companiesHref,
  KIND_TABS,
  type KindTab,
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
  kind,
  vertical,
  verticals,
  followUps = false,
}: {
  kind: KindTab;
  vertical: VerticalTab;
  verticals: VerticalOption[];
  followUps?: boolean;
}) {
  const router = useRouter();

  function go(next: {
    kind?: KindTab;
    vertical?: VerticalTab;
    followUps?: boolean;
  }) {
    router.push(
      companiesHref(
        next.kind ?? kind,
        next.vertical ?? vertical,
        next.followUps ?? followUps,
      ),
    );
  }

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-[var(--border)]">
      <div className="flex flex-col divide-y divide-[var(--border)] sm:flex-row sm:divide-x sm:divide-y-0">
        <FilterSelect
          label="Type"
          value={kind}
          options={KIND_TABS}
          active={kind !== "all"}
          onChange={(value) => go({ kind: value as KindTab })}
          className="sm:flex-1"
        />
        <FilterSelect
          label="Vertical"
          value={vertical}
          options={[
            { id: "all", label: "All" },
            ...verticals.map((item) => ({ id: item.id, label: item.name })),
          ]}
          active={vertical !== "all"}
          onChange={(value) => go({ vertical: value })}
          className="sm:flex-1"
        />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-3 py-2">
        <Link
          href={companiesHref(kind, vertical, !followUps)}
          className={`text-sm ${
            followUps
              ? "font-medium text-[var(--accent)]"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {followUps ? "Showing follow-ups due" : "Show follow-ups due"}
        </Link>
        {kind !== "all" || vertical !== "all" || followUps ? (
          <button
            type="button"
            onClick={() =>
              go({ kind: "all", vertical: "all", followUps: false })
            }
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
