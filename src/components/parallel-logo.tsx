import Image from "next/image";
import Link from "next/link";

export function ParallelLogo({
  href = "/home",
  className = "h-8 w-auto",
  priority = true,
}: {
  href?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center">
      <Image
        src="/parallel-logo.png"
        alt="Parallel"
        width={2777}
        height={715}
        className={className}
        priority={priority}
      />
    </Link>
  );
}
