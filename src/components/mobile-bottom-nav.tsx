"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { primaryNavItems, visibleNavItems } from "@/lib/nav";

export function MobileBottomNav({
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
  });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="app-container flex items-stretch">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center px-2 text-xs font-medium ${
                  active
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted)] active:text-[var(--foreground)]"
                }`}
              >
                <span
                  className={`mb-0.5 h-1 w-1 rounded-full ${
                    active ? "bg-[var(--accent)]" : "bg-transparent"
                  }`}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
