"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
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
}: {
  projectId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  scheduledWeekdays: number[];
  projectType: ProjectType | null;
  monthlyHours: number | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, startSave] = useTransition();

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Project</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Name, engagement, usual work days, and logo. Clients do not see
        engagement hours.
      </p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            if (removeLogo) {
              formData.set("remove_logo", "1");
            }
            setSaved(false);
            startSave(async () => {
              const result = await updateProject(projectId, formData);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setError(null);
              setRemoveLogo(false);
              setSaved(true);
              router.refresh();
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save project"}
            </button>
            {saved ? (
              <p className="text-sm text-[var(--muted)]">Saved.</p>
            ) : null}
          </div>
        </form>
        {error ? (
          <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </section>
  );
}

export function ProjectDeleteSettings({
  projectId,
  name,
}: {
  projectId: string;
  name: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [pending, startDelete] = useTransition();
  const nameMatches = confirmName.trim() === name;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-medium text-[var(--danger)]">Delete project</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        This permanently removes the project, lists, tasks, files, messages, and
        reports. Type the project name to confirm.
      </p>
      <form
        className="mt-4 flex flex-col gap-3"
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
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-[var(--accent-soft)] disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete project"}
        </button>
      </form>
      {error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
