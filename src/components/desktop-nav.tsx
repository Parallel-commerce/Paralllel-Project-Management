"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { primaryNavItems, visibleNavItems } from "@/lib/nav";

export function DesktopNav({
  isPlatformAdmin,
  isInternal = false,
}: {
  isPlatformAdmin: boolean;
  isInternal?: boolean;
}) {
  const pathname = usePathname();
  const items = visibleNavItems(primaryNavItems, {
    isInternal,
    isPlatformAdmin,
    desktop: true,
  });

  return (
    <nav
      className="hidden items-stretch gap-1 text-sm md:flex"
      aria-label="Primary"
    >
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center px-2.5 ${
              active
                ? "font-medium text-[var(--accent)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {item.label}
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-[var(--accent)]"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
