export function ReportPeriodMark({
  period,
}: {
  period: string | null | undefined;
}) {
  if (period !== "week" && period !== "month") return null;
  const monthly = period === "month";
  return (
    <span
      className={`inline-flex h-5 w-[4.75rem] shrink-0 items-center justify-center rounded-md border text-[11px] font-medium ${
        monthly
          ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-[var(--warm-grey)] bg-[color-mix(in_srgb,var(--sand)_45%,white)] text-[var(--charcoal)]"
      }`}
    >
      {monthly ? "Monthly" : "Weekly"}
    </span>
  );
}

export function reportPeriodChipClass(tone: "week" | "month" | null) {
  if (tone === "month") {
    return "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-soft)]";
  }
  if (tone === "week") {
    return "border-[var(--warm-grey)] bg-[color-mix(in_srgb,var(--sand)_45%,white)]";
  }
  return "border-[var(--border)] bg-white";
}
