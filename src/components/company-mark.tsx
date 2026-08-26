"use client";

import { useState } from "react";

import { companyLogoUrl } from "@/lib/company-logo";

export function CompanyMark({
  name,
  website,
  size = "md",
}: {
  name: string;
  website?: string | null;
  size?: "md" | "lg";
}) {
  const src = companyLogoUrl(website);
  const [failed, setFailed] = useState(false);
  const box =
    size === "lg"
      ? "h-12 w-12 sm:h-14 sm:w-14"
      : "h-11 w-11";
  const text = size === "lg" ? "text-lg" : "text-base";
  const letter = (name.trim().slice(0, 1) || "?").toUpperCase();

  if (!src || failed) {
    return (
      <span
        className={`flex ${box} shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-display ${text} text-[var(--accent)]`}
      >
        {letter}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size === "lg" ? 56 : 44}
      height={size === "lg" ? 56 : 44}
      className={`${box} shrink-0 rounded-lg border border-[var(--border)] bg-white object-contain p-1`}
      onError={() => setFailed(true)}
    />
  );
}
