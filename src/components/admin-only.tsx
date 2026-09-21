import type { ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function AdminOnly({
  children,
  className,
  variant = "block",
}: {
  children: ReactNode;
  className?: string;
  variant?: "block" | "inline";
}) {
  return (
    <div
      className={cx(
        "admin-only",
        variant === "inline" && "admin-only-inline",
        className,
      )}
    >
      {children}
    </div>
  );
}
