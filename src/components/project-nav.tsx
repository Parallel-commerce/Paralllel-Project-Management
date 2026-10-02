"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminOnly } from "@/components/admin-only";

function navClass(active: boolean) {
  return `min-h-10 rounded-md border px-3 py-2 text-sm transition ${
    active
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
      : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
  }`;
}

export function ProjectNav({
  projectId,
  name,
  logoUrl,
  isAdmin,
  showStore = true,
}: {
  projectId: string;
  name: string;
  logoUrl: string | null;
  isAdmin: boolean;
  showStore?: boolean;
}) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const overviewActive = pathname === base;
  const messagesActive = pathname.startsWith(`${base}/messages`);
  const storeActive = pathname.startsWith(`${base}/store`);
  const settingsActive = pathname.startsWith(`${base}/settings`);

  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          href="/projects"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← Projects
        </Link>
        <div className="mt-2 flex items-center gap-3">
          {logoUrl ? (
            <Link href={base} className="shrink-0">
              <Image
                src={logoUrl}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 rounded-xl border border-[var(--border)] bg-white object-cover"
              />
            </Link>
          ) : null}
          <Link
            href={base}
            className={`min-w-0 font-display text-2xl tracking-tight hover:text-[var(--accent)] sm:text-3xl ${
              overviewActive ? "text-[var(--foreground)]" : ""
            }`}
          >
            {name}
          </Link>
        </div>
      </div>
      <nav
        aria-label="Project"
        className="flex flex-wrap items-center gap-2"
      >
        <Link href={`${base}/messages`} className={navClass(messagesActive)}>
          Messages
        </Link>
        {showStore ? (
          <Link href={`${base}/store`} className={navClass(storeActive)}>
            Store
          </Link>
        ) : null}
        {isAdmin ? (
          <AdminOnly variant="inline">
            <Link
              href={`${base}/settings`}
              className={navClass(settingsActive)}
            >
              Settings
            </Link>
          </AdminOnly>
        ) : null}
      </nav>
    </div>
  );
}
