import Link from "next/link";

const CHIP =
  "inline-flex max-w-full items-center gap-1.5 rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/25";

export function CompanyVerticalTag({
  name,
  href,
  className = "",
}: {
  name: string;
  href?: string;
  className?: string;
}) {
  const content = (
    <>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
        aria-hidden
      />
      <span className="truncate">{name}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${CHIP} hover:bg-white ${className}`}>
        {content}
      </Link>
    );
  }

  return <span className={`${CHIP} ${className}`}>{content}</span>;
}
