"use client";

import Image from "next/image";
import { useState, useTransition } from "react";

import { updateProject } from "@/lib/actions/projects";

export function ProjectSettings({
  projectId,
  name,
  description,
  logoUrl,
  canManage,
}: {
  projectId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setError(null);
          setRemoveLogo(false);
        }}
        className="min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
      >
        Project settings
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-96 sm:max-w-[calc(100vw-2rem)] sm:rounded-xl"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)] sm:hidden" />
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              if (removeLogo) {
                formData.set("remove_logo", "1");
              }
              startTransition(async () => {
                const result = await updateProject(projectId, formData);
                if (result?.error) {
                  setError(result.error);
                } else {
                  setError(null);
                  setRemoveLogo(false);
                  setOpen(false);
                }
              });
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
              Name
              <input
                name="name"
                required
                defaultValue={name}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
              Description
              <textarea
                name="description"
                rows={3}
                defaultValue={description ?? ""}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
              />
            </label>
            <div className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
              <span>Logo</span>
              {logoUrl && !removeLogo ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={logoUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-lg border border-[var(--border)] object-cover"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() => setRemoveLogo(true)}
                    className="text-xs text-[var(--danger)] hover:underline"
                  >
                    Remove logo
                  </button>
                </div>
              ) : null}
              <input
                name="logo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={removeLogo}
                className="text-sm text-[var(--foreground)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-sm"
              />
              <p className="text-xs text-[var(--muted)]">
                JPEG, PNG, WebP, or GIF · max 2MB
              </p>
            </div>
            {error ? (
              <p className="text-sm text-[var(--danger)]">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
