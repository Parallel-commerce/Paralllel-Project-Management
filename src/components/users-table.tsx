"use client";

import { useState, useTransition } from "react";

import {
  removeMemberFromProject,
  setPlatformAdmin,
  updateMemberRole,
  updateUserProfile,
} from "@/lib/actions/users";
import { PROJECT_ROLES, type ProjectRole } from "@/types/database";

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
  memberships: UserMembership[];
};

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {error ? (
        <p className="mb-4 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Projects</th>
              <th className="px-4 py-3 font-medium">Platform admin</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-[var(--muted)]">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isOpen = expanded[user.id] ?? false;
                return (
                  <UserTableRows
                    key={user.id}
                    user={user}
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
                    startTransition={startTransition}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserTableRows({
  user,
  currentUserId,
  isOpen,
  pending,
  onToggle,
  onError,
  startTransition,
}: {
  user: UserRow;
  currentUserId: string;
  isOpen: boolean;
  pending: boolean;
  onToggle: () => void;
  onError: (message: string | null) => void;
  startTransition: (fn: () => void) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [title, setTitle] = useState(user.title ?? "");
  const dirty =
    fullName.trim() !== (user.full_name ?? "").trim() ||
    title.trim() !== (user.title ?? "").trim();

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
                });
              }}
            />
            {user.is_platform_admin ? "Yes" : "No"}
          </label>
          {user.id === currentUserId ? (
            <p className="mt-1 text-xs text-[var(--muted)]">That’s you</p>
          ) : null}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            {isOpen ? "Hide projects" : "Manage projects"}
          </button>
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
          </td>
        </tr>
      ) : null}
    </>
  );
}
