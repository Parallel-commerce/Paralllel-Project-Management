"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  addMemberToProject,
  deleteUser,
  reinstateUser,
  removeMemberFromProject,
  setPlatformAdmin,
  updateMemberRole,
  updateUserProfile,
} from "@/lib/actions/users";
import { PROJECT_ROLES, type ProjectRole } from "@/types/database";

import type { ProjectOption } from "./add-user-form";

export type UserMembership = {
  project_id: string;
  project_name: string;
  role: ProjectRole;
};

export type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  title: string | null;
  is_platform_admin: boolean;
  deleted_at?: string | null;
  previous_email?: string | null;
  memberships: UserMembership[];
};

function formatRemovedAt(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function UsersTable({
  users,
  removedUsers,
  projects,
  currentUserId,
}: {
  users: UserRow[];
  removedUsers: UserRow[];
  projects: ProjectOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"active" | "removed">("active");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const confirmUser = useMemo(
    () => users.find((user) => user.id === confirmDeleteId) ?? null,
    [users, confirmDeleteId],
  );

  return (
    <div>
      {error ? (
        <p className="mb-4 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="mb-4 text-sm text-[var(--accent)]" role="status">
          {info}
        </p>
      ) : null}

      <div
        className="mb-4 inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5"
        role="tablist"
        aria-label="User lists"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "active"}
          onClick={() => setTab("active")}
          className={`rounded px-3 py-1.5 text-sm ${
            tab === "active"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Active ({users.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "removed"}
          onClick={() => setTab("removed")}
          className={`rounded px-3 py-1.5 text-sm ${
            tab === "removed"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Removed ({removedUsers.length})
        </button>
      </div>

      {tab === "active" ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Projects</th>
                <th className="px-4 py-3 font-medium">Platform admin</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-[var(--muted)]">
                    No active users yet.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isOpen = expanded[user.id] ?? false;
                  return (
                    <UserTableRows
                      key={user.id}
                      user={user}
                      projects={projects}
                      currentUserId={currentUserId}
                      isOpen={isOpen}
                      pending={pending}
                      onToggle={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [user.id]: !isOpen,
                        }))
                      }
                      onError={setError}
                      onInfo={setInfo}
                      onSuccess={() => router.refresh()}
                      onRequestDelete={() => setConfirmDeleteId(user.id)}
                      startTransition={startTransition}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <RemovedUsersPanel
          users={removedUsers}
          pending={pending}
          onError={setError}
          onInfo={setInfo}
          onSuccess={() => router.refresh()}
          startTransition={startTransition}
        />
      )}

      {confirmUser ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
            className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg sm:rounded-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="delete-user-title"
              className="font-display text-xl tracking-tight"
            >
              Remove user?
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Remove{" "}
              <span className="font-medium text-[var(--foreground)]">
                {confirmUser.full_name?.trim() || confirmUser.email}
              </span>{" "}
              from Parallel?
            </p>
            <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-[var(--muted)]">
              <li>They lose access immediately and leave every project</li>
              <li>
                Tasks, comments, messages, and time stay — their name shows as
                (removed)
              </li>
              <li>You can reinstate them later from the Removed tab</li>
            </ul>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmDeleteId(null)}
                className="min-h-10 rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await deleteUser(confirmUser.id);
                    if (result?.error) {
                      setError(result.error);
                      setInfo(null);
                    } else {
                      setError(null);
                      setInfo(
                        `${confirmUser.full_name?.trim() || confirmUser.email} was removed. You can reinstate them from the Removed tab.`,
                      );
                      setConfirmDeleteId(null);
                      setTab("removed");
                      router.refresh();
                    }
                  });
                }}
                className="min-h-10 rounded-md bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Removing…" : "Remove user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RemovedUsersPanel({
  users,
  pending,
  onError,
  onInfo,
  onSuccess,
  startTransition,
}: {
  users: UserRow[];
  pending: boolean;
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
  onSuccess: () => void;
  startTransition: (fn: () => void) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
        Removed accounts keep their history. Reinstate to restore login and let
        you add them to projects again.
      </div>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">Removed</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {users.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-[var(--muted)]">
                No removed users.
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <RemovedUserRow
                key={user.id}
                user={user}
                pending={pending}
                onError={onError}
                onInfo={onInfo}
                onSuccess={onSuccess}
                startTransition={startTransition}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function RemovedUserRow({
  user,
  pending,
  onError,
  onInfo,
  onSuccess,
  startTransition,
}: {
  user: UserRow;
  pending: boolean;
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
  onSuccess: () => void;
  startTransition: (fn: () => void) => void;
}) {
  const [email, setEmail] = useState(user.previous_email ?? "");

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-medium">
          {user.full_name?.trim() || "Removed user"}{" "}
          <span className="font-normal text-[var(--muted)]">(removed)</span>
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {user.previous_email
            ? `Was ${user.previous_email}`
            : "Original email unknown — enter one to reinstate"}
        </p>
        <label className="mt-2 block max-w-sm">
          <span className="sr-only">Email to restore</span>
          <input
            type="email"
            value={email}
            disabled={pending}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email to restore"
            className="w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm"
          />
        </label>
      </td>
      <td className="px-4 py-3 text-[var(--muted)]">
        {user.deleted_at ? formatRemovedAt(user.deleted_at) : "—"}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          disabled={pending || !email.trim()}
          onClick={() => {
            if (
              !window.confirm(
                `Reinstate ${user.full_name?.trim() || email}? They’ll get a magic link at ${email.trim()}.`,
              )
            ) {
              return;
            }
            startTransition(async () => {
              const result = await reinstateUser(user.id, email.trim());
              if (result?.error) {
                onError(result.error);
                onInfo(null);
              } else {
                onError(null);
                onInfo(
                  `${user.full_name?.trim() || result.email} was reinstated. A magic link was sent to ${result.email}.`,
                );
                onSuccess();
              }
            });
          }}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Reinstating…" : "Reinstate"}
        </button>
      </td>
    </tr>
  );
}

function UserTableRows({
  user,
  projects,
  currentUserId,
  isOpen,
  pending,
  onToggle,
  onError,
  onInfo,
  onSuccess,
  onRequestDelete,
  startTransition,
}: {
  user: UserRow;
  projects: ProjectOption[];
  currentUserId: string;
  isOpen: boolean;
  pending: boolean;
  onToggle: () => void;
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
  onSuccess: () => void;
  onRequestDelete: () => void;
  startTransition: (fn: () => void) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [title, setTitle] = useState(user.title ?? "");
  const [addProjectId, setAddProjectId] = useState("");
  const [addRole, setAddRole] = useState<ProjectRole>("client");
  const dirty =
    fullName.trim() !== (user.full_name ?? "").trim() ||
    title.trim() !== (user.title ?? "").trim();

  const memberProjectIds = new Set(user.memberships.map((m) => m.project_id));
  const availableProjects = projects.filter(
    (project) => !memberProjectIds.has(project.id),
  );

  return (
    <>
      <tr className="align-top">
        <td className="px-4 py-3">
          <div className="flex max-w-sm flex-col gap-2">
            <input
              type="text"
              name="full_name"
              value={fullName}
              disabled={pending}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Full name"
              aria-label={`Name for ${user.email}`}
              className="w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm font-medium"
            />
            <input
              type="text"
              name="title"
              value={title}
              disabled={pending}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title (optional)"
              aria-label={`Title for ${user.email}`}
              className="w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm"
            />
            <p className="text-xs text-[var(--muted)]">{user.email}</p>
            {dirty ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const formData = new FormData();
                  formData.set("full_name", fullName);
                  formData.set("title", title);
                  startTransition(async () => {
                    const result = await updateUserProfile(user.id, formData);
                    onError(result?.error ?? null);
                    onInfo(null);
                    if (!result?.error) {
                      onSuccess();
                    }
                  });
                }}
                className="self-start rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Save
              </button>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {user.memberships.length}
        </td>
        <td className="px-4 py-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={user.is_platform_admin}
              disabled={pending || user.id === currentUserId}
              onChange={(event) => {
                const enabled = event.target.checked;
                startTransition(async () => {
                  const result = await setPlatformAdmin(user.id, enabled);
                  onError(result?.error ?? null);
                  onInfo(null);
                  if (!result?.error) {
                    onSuccess();
                  }
                });
              }}
            />
            {user.is_platform_admin ? "Yes" : "No"}
          </label>
          {user.id === currentUserId ? (
            <p className="mt-1 text-xs text-[var(--muted)]">That’s you</p>
          ) : null}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <button
              type="button"
              onClick={onToggle}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              {isOpen ? "Hide projects" : "Manage projects"}
            </button>
            {user.id !== currentUserId ? (
              <button
                type="button"
                disabled={pending}
                onClick={onRequestDelete}
                className="rounded-md border border-[var(--danger)]/30 px-2.5 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-red-50 disabled:opacity-50"
              >
                Remove user
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {isOpen ? (
        <tr>
          <td colSpan={4} className="bg-[var(--background)]/50 px-4 py-3">
            {user.memberships.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Not on any projects.
              </p>
            ) : (
              <ul className="space-y-2">
                {user.memberships.map((membership) => (
                  <li
                    key={`${user.id}-${membership.project_id}`}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  >
                    <span className="min-w-[10rem] flex-1 font-medium">
                      {membership.project_name}
                    </span>
                    <select
                      value={membership.role}
                      disabled={pending}
                      onChange={(event) => {
                        const role = event.target.value as ProjectRole;
                        startTransition(async () => {
                          const result = await updateMemberRole(
                            membership.project_id,
                            user.id,
                            role,
                          );
                          onError(result?.error ?? null);
                          onInfo(null);
                          if (!result?.error) {
                            onSuccess();
                          }
                        });
                      }}
                      className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                    >
                      {PROJECT_ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    {user.id !== currentUserId ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            const result = await removeMemberFromProject(
                              membership.project_id,
                              user.id,
                            );
                            onError(result?.error ?? null);
                            onInfo(null);
                            if (!result?.error) {
                              onSuccess();
                            }
                          });
                        }}
                        className="text-xs text-[var(--danger)] hover:underline"
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">You</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {availableProjects.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                <span className="text-sm text-[var(--muted)]">Add to project</span>
                <select
                  value={addProjectId}
                  disabled={pending}
                  onChange={(event) => setAddProjectId(event.target.value)}
                  className="min-w-[12rem] flex-1 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm sm:flex-none"
                >
                  <option value="">Select project</option>
                  {availableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <select
                  value={addRole}
                  disabled={pending}
                  onChange={(event) =>
                    setAddRole(event.target.value as ProjectRole)
                  }
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
                  disabled={pending || !addProjectId}
                  onClick={() => {
                    if (!addProjectId) return;
                    startTransition(async () => {
                      const result = await addMemberToProject(
                        addProjectId,
                        user.id,
                        addRole,
                      );
                      onError(result?.error ?? null);
                      onInfo(null);
                      if (!result?.error) {
                        setAddProjectId("");
                        setAddRole("client");
                        onSuccess();
                      }
                    });
                  }}
                  className="rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            ) : projects.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Create a project first to allocate people.
              </p>
            ) : (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Already on every project.
              </p>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
