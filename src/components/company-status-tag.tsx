import { companyStatusColors, companyStatusLabel } from "@/lib/company-status";
import type { CompanyStatus } from "@/types/database";

export function CompanyStatusTag({
  status,
  className = "",
}: {
  status: CompanyStatus;
  className?: string;
}) {
  const colors = companyStatusColors(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${colors.tag} ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors.accent}`}
        aria-hidden
      />
      {companyStatusLabel(status)}
    </span>
  );
}
