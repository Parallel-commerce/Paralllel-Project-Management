"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { invitePlatformUser } from "@/lib/actions/users";
import { PROJECT_ROLES, type ProjectRole } from "@/types/database";

export type ProjectOption = {
  id: string;
  name: string;
};

type AllocationRow = {
  key: string;
  projectId: string;
  role: ProjectRole;
};

export function AddUserForm({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const usedProjectIds = new Set(
    allocations.map((row) => row.projectId).filter(Boolean),
  );
  const availableProjects = projects.filter((project) => !usedProjectIds.has(project.id));

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="font-medium">Add user</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Send a sign-in invite. Name and title are saved with the account.
        Optionally assign projects now.
      </p>

      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          setError(null);
          setInfo(null);
          startTransition(async () => {
            const result = await invitePlatformUser(formData);
            if ("error" in result && result.error) {
              setError(result.error);
              return;
            }
            let message =
              "message" in result && result.message
                ? result.message
                : "Invite sent.";
            if ("warning" in result && result.warning) {
              message = result.warning;
            }
            if (
              "platformAdminPending" in result &&
              result.platformAdminPending
            ) {
              message +=
                " Platform admin can be enabled after they appear in this list.";
            }
            setInfo(message);
            form.reset();
            setAllocations([]);
            router.refresh();
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Email
            <input
              type="email"
              name="email"
              required
              disabled={pending}
              placeholder="person@company.com"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Full name
            <input
              type="text"
              name="full_name"
              disabled={pending}
              placeholder="Optional for new users"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Title
            <input
              type="text"
              name="title"
              disabled={pending}
              placeholder="Optional"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-[var(--foreground)]">
            <input
              type="checkbox"
              name="is_platform_admin"
              value="1"
              disabled={pending}
              className="mt-0.5"
            />
            Platform admin
          </label>
        </div>

        <div className="mt-1">
          <p className="text-sm font-medium">Projects</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Optional — allocate now or add later from Manage projects.
          </p>

          <ul className="mt-2 space-y-2">
            {allocations.map((row, index) => {
              const options = projects.filter(
                (project) =>
                  project.id === row.projectId || !usedProjectIds.has(project.id),
              );
              return (
                <li
                  key={row.key}
                  className="flex flex-wrap items-center gap-2"
                >
                  <select
                    name="project_id"
                    required
                    disabled={pending}
                    value={row.projectId}
                    onChange={(event) => {
                      const projectId = event.target.value;
                      setAllocations((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, projectId } : item,
                        ),
                      );
                    }}
                    className="min-w-[12rem] flex-1 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">Select project</option>
                    {options.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <select
                    name="project_role"
                    disabled={pending}
                    value={row.role}
                    onChange={(event) => {
                      const role = event.target.value as ProjectRole;
                      setAllocations((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, role } : item,
                        ),
                      );
                    }}
                    className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                  >
                    {PROJECT_ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      setAllocations((prev) =>
                        prev.filter((_, i) => i !== index),
                      )
                    }
                    className="text-xs text-[var(--danger)] hover:underline"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>

          {availableProjects.length > 0 || allocations.length === 0 ? (
            <button
              type="button"
              disabled={pending || projects.length === 0}
              onClick={() =>
                setAllocations((prev) => [
                  ...prev,
                  {
                    key: `${Date.now()}-${prev.length}`,
                    projectId: "",
                    role: "client",
                  },
                ])
              }
              className="mt-2 text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
            >
              {projects.length === 0
                ? "No projects yet"
                : "Add project allocation"}
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send invite"}
          </button>
          {error ? (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="text-sm text-[var(--muted)]" role="status">
              {info}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
