import Image from "next/image";

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function PersonAvatar({
  name,
  avatarUrl,
  size = 32,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-[var(--border)] object-cover"
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] font-medium text-[var(--muted)]"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.32)) }}
      aria-hidden
    >
      {initialsFromName(name)}
    </span>
  );
}
