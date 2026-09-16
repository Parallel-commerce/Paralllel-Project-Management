import {
  companyReengageColors,
  companyReengageLabel,
} from "@/lib/company-reengage";
import type { CompanyReengage } from "@/types/database";

export function CompanyReengageTag({
  canReengage,
  className = "",
}: {
  canReengage: CompanyReengage | null;
  className?: string;
}) {
  const colors = companyReengageColors(canReengage);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${colors.tag} ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors.accent}`}
        aria-hidden
      />
      Re-engage: {companyReengageLabel(canReengage)}
    </span>
  );
}
