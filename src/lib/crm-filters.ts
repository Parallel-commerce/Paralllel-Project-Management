import {
  COMPANY_KINDS,
  type CompanyKind,
} from "@/types/database";

export type KindTab = CompanyKind | "all";
export type VerticalTab = "all" | string;

export const KIND_TABS: { id: KindTab; label: string }[] = [
  { id: "all", label: "All" },
  ...COMPANY_KINDS.map((kind) => ({
    id: kind.value,
    label: kind.label,
  })),
];

/** @deprecated Prefer companiesHref / prospects board. Kept for existing detail links. */
export type StatusTab = "all" | "follow_ups" | string;

export function companiesHref(
  kind: KindTab,
  vertical: VerticalTab = "all",
  followUps = false,
) {
  const params = new URLSearchParams();
  if (kind !== "all") params.set("kind", kind);
  if (vertical !== "all") params.set("vertical", vertical);
  if (followUps) params.set("follow_ups", "1");
  const query = params.toString();
  return query ? `/crm/companies?${query}` : "/crm/companies";
}

export function crmHref(
  _status: StatusTab,
  kind: KindTab,
  vertical: VerticalTab = "all",
) {
  return companiesHref(kind, vertical, _status === "follow_ups");
}
