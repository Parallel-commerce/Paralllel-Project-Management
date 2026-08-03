import Image from "next/image";
import Link from "next/link";

export function ParallelLogo({
  href = "/projects",
  className = "h-7 w-auto",
  priority = false,
}: {
  href?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center">
      <Image
        src="/parallel-logo.png"
        alt="parallel."
        width={160}
        height={48}
        className={className}
        priority={priority}
      />
    </Link>
  );
}
