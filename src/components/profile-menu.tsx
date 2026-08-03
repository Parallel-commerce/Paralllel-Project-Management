"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";

import { updateOwnProfile } from "@/lib/actions/users";

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function ProfileMenu({
  email,
  fullName,
  title,
  avatarUrl,
}: {
  email: string;
  fullName: string | null;
  title: string | null;
  avatarUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const displayName = fullName?.trim() || email;
  const initials = initialsFromName(displayName);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setError(null);
          setRemoveAvatar(false);
        }}
        className="flex min-h-9 max-w-[14rem] items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--surface-2)]"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full border border-[var(--border)] object-cover"
            unoptimized
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[10px] font-medium text-[var(--muted)]">
            {initials}
          </span>
        )}
        <span className="hidden min-w-0 truncate text-sm text-[var(--foreground)] sm:inline">
          {displayName}
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            aria-label="Close profile"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-96 sm:max-w-[calc(100vw-2rem)] sm:rounded-xl"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            role="dialog"
            aria-label="Profile settings"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)] sm:hidden" />
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                if (removeAvatar) {
                  formData.set("remove_avatar", "1");
                }
                startTransition(async () => {
                  const result = await updateOwnProfile(formData);
                  if (result?.error) {
                    setError(result.error);
                  } else {
                    setError(null);
                    setRemoveAvatar(false);
                    setOpen(false);
                  }
                });
              }}
            >
              <div>
                <h2 className="font-medium">Your profile</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">{email}</p>
              </div>

              <div className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
                <span>Photo</span>
                {avatarUrl && !removeAvatar ? (
                  <div className="flex items-center gap-3">
                    <Image
                      src={avatarUrl}
                      alt=""
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-full border border-[var(--border)] object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => setRemoveAvatar(true)}
                      className="text-xs text-[var(--danger)] hover:underline"
                    >
                      Remove photo
                    </button>
                  </div>
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-sm font-medium text-[var(--muted)]">
                    {initials}
                  </div>
                )}
                <input
                  name="avatar"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={removeAvatar}
                  className="text-sm text-[var(--foreground)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-sm"
                />
              </div>

              <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
                Name
                <input
                  name="full_name"
                  defaultValue={fullName ?? ""}
                  placeholder="Your name"
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
                Title
                <input
                  name="title"
                  defaultValue={title ?? ""}
                  placeholder="Optional"
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
                />
              </label>

              {error ? (
                <p className="text-sm text-[var(--danger)]" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
                >
                  {pending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
