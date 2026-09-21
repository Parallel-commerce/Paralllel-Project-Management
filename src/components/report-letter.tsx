import { markdownToPageHtml } from "@/lib/report-markdown";

export function ReportLetter({
  projectName,
  title,
  narrative,
}: {
  projectName: string;
  title: string;
  narrative: string | null;
}) {
  const html = narrative?.trim() ? markdownToPageHtml(narrative) : null;

  return (
    <article className="mt-8 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6 sm:px-10 sm:py-10">
      <p className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
        Parallel
      </p>
      <p className="mt-6 text-[13px] text-[var(--muted)]">{projectName}</p>
      <h1 className="mt-1 text-base font-semibold text-[var(--foreground)]">
        {title}
      </h1>
      {html ? (
        <div
          className="report-prose mt-5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--muted)]">
          No narrative yet.
        </p>
      )}
      <p className="mt-8 text-[13px] text-[var(--muted)]">— Parallel</p>
    </article>
  );
}
