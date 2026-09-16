"use client";

import Image from "next/image";
import { useState, useTransition } from "react";

import { ProjectEngagementFields } from "@/components/project-engagement-fields";
import { WeekdayPicker } from "@/components/weekday-picker";
import { deleteProject, updateProject } from "@/lib/actions/projects";
import type { ProjectType } from "@/types/database";

export function ProjectSettings({
  projectId,
  name,
  description,
  logoUrl,
  scheduledWeekdays,
  projectType,
  monthlyHours,
  canManage,
}: {
  projectId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  scheduledWeekdays: number[];
  projectType: ProjectType | null;
  monthlyHours: number | null;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const pending = saving || deleting;
  const nameMatches = confirmName.trim() === name;

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
          setConfirmName("");
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
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[min(85dvh,calc(100vh-5rem))] sm:w-96 sm:max-w-[calc(100vw-2rem)] sm:rounded-xl"
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
              startSave(async () => {
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
            <ProjectEngagementFields
              projectType={projectType}
              monthlyHours={monthlyHours}
            />
            <WeekdayPicker defaultValue={scheduledWeekdays} />
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
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>

          {error ? (
            <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-sm font-medium text-[var(--danger)]">
              Delete project
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              This permanently removes the project, lists, tasks, files,
              messages, and reports. Type the project name to confirm.
            </p>
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!nameMatches) {
                  setError("Type the project name exactly to confirm deletion.");
                  return;
                }
                setError(null);
                startDelete(async () => {
                  const result = await deleteProject(projectId, confirmName);
                  if (result?.error) {
                    setError(result.error);
                  }
                });
              }}
            >
              <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
                Type “{name}” to confirm
                <input
                  value={confirmName}
                  onChange={(event) => setConfirmName(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
                />
              </label>
              <button
                type="submit"
                disabled={pending || !nameMatches}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--danger)] hover:bg-red-50 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete project"}
              </button>
            </form>
          </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
