import {
  COMPANY_KINDS,
  COMPANY_STATUSES,
  type CompanyKind,
  type CompanyStatus,
} from "@/types/database";

export type StatusTab = CompanyStatus | "all" | "follow_ups";
export type KindTab = CompanyKind | "all";

export const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: "all", label: "All" },
  ...COMPANY_STATUSES.map((status) => ({
    id: status.value,
    label: status.label,
  })),
  { id: "follow_ups", label: "Follow-ups" },
];

export const KIND_TABS: { id: KindTab; label: string }[] = [
  { id: "all", label: "All" },
  ...COMPANY_KINDS.map((kind) => ({
    id: kind.value,
    label: kind.label,
  })),
];

export function crmHref(status: StatusTab, kind: KindTab) {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (kind !== "all") params.set("kind", kind);
  const query = params.toString();
  return query ? `/crm?${query}` : "/crm";
}
