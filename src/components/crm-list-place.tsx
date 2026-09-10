"use client";

import Link from "next/link";
import { useLayoutEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "crm-list-place";

type CrmListPlace = {
  href: string;
  scrollY: number;
  companyId: string;
  restore: boolean;
};

function readPlace(): CrmListPlace | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CrmListPlace;
    if (!parsed?.href || !parsed.companyId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePlace(place: CrmListPlace) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(place));
}

export function rememberCrmListPlace(companyId: string) {
  writePlace({
    href: `${window.location.pathname}${window.location.search}`,
    scrollY: window.scrollY,
    companyId,
    restore: true,
  });
}

export function CrmCompanyLink({
  companyId,
  className,
  children,
}: {
  companyId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/crm/${companyId}`}
      className={className}
      onClick={() => rememberCrmListPlace(companyId)}
    >
      {children}
    </Link>
  );
}

/** Restores the previous list filters/scroll after opening a company. */
export function CrmListPlaceRestore() {
  useLayoutEffect(() => {
    const place = readPlace();
    if (!place?.restore) return;

    const current = `${window.location.pathname}${window.location.search}`;
    if (place.href !== current) {
      writePlace({ ...place, restore: false });
      return;
    }

    const apply = () => {
      const row = document.getElementById(`crm-company-${place.companyId}`);
      if (row) {
        row.scrollIntoView({ block: "center" });
        return;
      }
      window.scrollTo(0, place.scrollY);
    };

    apply();
    const frame = requestAnimationFrame(apply);
    const timeout = window.setTimeout(() => {
      apply();
      writePlace({ ...place, restore: false });
    }, 50);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}

export function CrmBackLink() {
  const [href, setHref] = useState("/crm");

  useLayoutEffect(() => {
    const place = readPlace();
    if (place?.href.startsWith("/crm")) {
      setHref(place.href);
    }
  }, []);

  return (
    <Link
      href={href}
      scroll={false}
      className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
    >
      ← Prospects
    </Link>
  );
}
