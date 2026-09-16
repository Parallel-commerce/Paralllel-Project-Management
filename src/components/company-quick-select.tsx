"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { updateCompanyKind, updateCompanyReengage, updateCompanyStatus } from "@/lib/actions/crm";
import { companyKindColors } from "@/lib/company-kind";
import {
  COMPANY_REENGAGE_OPTIONS,
  companyReengageColors,
  companyReengageValue,
  type CompanyReengageFormValue,
} from "@/lib/company-reengage";
import { companyStatusColors } from "@/lib/company-status";
import {
  COMPANY_KINDS,
  COMPANY_STATUSES,
  type CompanyKind,
  type CompanyReengage,
  type CompanyStatus,
} from "@/types/database";

function TagSelect({
  label,
  value,
  options,
  accent,
  tag,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  accent: string;
  tag: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const selected =
    options.find((option) => option.value === value)?.label ?? value;

  return (
    <label
      className={`relative inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tag} ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent}`} aria-hidden />
      <span className="min-w-0 truncate">{selected}</span>
      <span aria-hidden className="text-[10px] leading-none opacity-70">
        ▾
      </span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value || "unset"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CompanyKindSelect({
  companyId,
  kind,
}: {
  companyId: string;
  kind: CompanyKind;
}) {
  const router = useRouter();
  const [value, setValue] = useState(kind);
  const [pending, startTransition] = useTransition();
  const colors = companyKindColors(value);

  useEffect(() => {
    setValue(kind);
  }, [kind]);

  return (
    <TagSelect
      label="Type"
      value={value}
      options={COMPANY_KINDS}
      accent={colors.accent}
      tag={colors.tag}
      disabled={pending}
      onChange={(next) => {
        const previous = value;
        setValue(next as CompanyKind);
        startTransition(async () => {
          const result = await updateCompanyKind(companyId, next);
          if (result?.error) {
            setValue(previous);
            return;
          }
          router.refresh();
        });
      }}
    />
  );
}

export function CompanyStatusSelect({
  companyId,
  status,
}: {
  companyId: string;
  status: CompanyStatus;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const colors = companyStatusColors(value);

  useEffect(() => {
    setValue(status);
  }, [status]);

  return (
    <TagSelect
      label="Status"
      value={value}
      options={COMPANY_STATUSES}
      accent={colors.accent}
      tag={colors.tag}
      disabled={pending}
      onChange={(next) => {
        const previous = value;
        setValue(next as CompanyStatus);
        startTransition(async () => {
          const result = await updateCompanyStatus(companyId, next);
          if (result?.error) {
            setValue(previous);
            return;
          }
          router.refresh();
        });
      }}
    />
  );
}

export function CompanyReengageSelect({
  companyId,
  canReengage,
}: {
  companyId: string;
  canReengage: CompanyReengage | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<CompanyReengageFormValue>(
    companyReengageValue(canReengage),
  );
  const [pending, startTransition] = useTransition();
  const colors = companyReengageColors(value || null);

  useEffect(() => {
    setValue(companyReengageValue(canReengage));
  }, [canReengage]);

  return (
    <TagSelect
      label="Can re-engage"
      value={value}
      options={COMPANY_REENGAGE_OPTIONS.map((option) => ({
        value: option.value,
        label:
          option.value === ""
            ? "Re-engage?"
            : `Re-engage: ${option.label}`,
      }))}
      accent={colors.accent}
      tag={colors.tag}
      disabled={pending}
      onChange={(next) => {
        const previous = value;
        setValue(next as CompanyReengageFormValue);
        startTransition(async () => {
          const result = await updateCompanyReengage(companyId, next);
          if (result?.error) {
            setValue(previous);
            return;
          }
          router.refresh();
        });
      }}
    />
  );
}
