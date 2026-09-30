"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  cancelInvite,
  inviteMember,
  removeMember,
  updateMemberRole,
} from "@/lib/actions/projects";
import { personDisplayName } from "@/lib/person";
import { PROJECT_ROLES, type ProjectRole } from "@/types/database";

type MemberRow = {
  user_id: string;
  role: ProjectRole;
  profile: {
    email: string;
    full_name: string | null;
    deleted_at?: string | null;
  } | null;
};

type InviteRow = {
  id: string;
  email: string;
  role: ProjectRole;
};

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function RoleBadge({ role }: { role: ProjectRole }) {
  const label = PROJECT_ROLES.find((item) => item.value === role)?.label ?? role;
  return (
    <span className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs font-medium capitalize text-[var(--muted)]">
      {label}
    </span>
  );
}

export function MembersPanel({
  projectId,
  isAdmin,
  currentUserId,
  members,
  invites,
}: {
  projectId: string;
  isAdmin: boolean;
  currentUserId: string;
  members: MemberRow[];
  invites: InviteRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-medium">People</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isAdmin
              ? "Manage who can access this project."
              : "Everyone on this project."}
          </p>
        </div>
        <span className="text-xs tabular-nums text-[var(--muted)]">
          {members.length}
        </span>
      </div>

      <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {members.map((m) => {
          const name = personDisplayName(
            m.profile,
            m.profile?.email ?? "Someone",
          );
          const email = m.profile?.email ?? "";
          const canRemove = isAdmin && m.user_id !== currentUserId;

          return (
            <li
              key={m.user_id}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-medium tracking-wide text-[var(--muted)]"
                aria-hidden
              >
                {initialsFor(name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium tracking-tight">
                  {name}
                </p>
                {email ? (
                  <p className="truncate text-xs text-[var(--muted)]">{email}</p>
                ) : null}
              </div>
              {isAdmin ? (
                <select
                  value={m.role}
                  disabled={pending}
                  aria-label={`Role for ${name}`}
                  onChange={(event) => {
                    const role = event.target.value as ProjectRole;
                    startTransition(async () => {
                      const result = await updateMemberRole(
                        projectId,
                        m.user_id,
                        role,
                      );
                      setError(result?.error ?? null);
                      if (!result?.error) {
                        router.refresh();
                      }
                    });
                  }}
                  className="min-h-9 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
                >
                  {PROJECT_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              ) : (
                <RoleBadge role={m.role} />
              )}
              {canRemove ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await removeMember(projectId, m.user_id);
                      setError(result?.error ?? null);
                      if (!result?.error) {
                        router.refresh();
                      }
                    });
                  }}
                  className="text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--danger)] hover:underline disabled:opacity-60"
                >
                  Remove
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {isAdmin && invites.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Pending invites
          </h3>
          <ul className="mt-2 space-y-2">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)]/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{invite.email}</p>
                  <p className="text-xs capitalize text-[var(--muted)]">
                    {PROJECT_ROLES.find((role) => role.value === invite.role)
                      ?.label ?? invite.role}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await cancelInvite(projectId, invite.id);
                      setError(result?.error ?? null);
                      if (!result?.error) {
                        router.refresh();
                      }
                    });
                  }}
                  className="shrink-0 text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--danger)] hover:underline disabled:opacity-60"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isAdmin ? (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            startTransition(async () => {
              const result = await inviteMember(projectId, formData);
              if (result?.error) {
                setError(result.error);
                setInfo(null);
              } else {
                setError(null);
                setInfo(result?.message ?? "Person added.");
                form.reset();
                router.refresh();
              }
            });
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-[var(--muted)]">
            Invite by email
            <input
              name="email"
              type="email"
              required
              placeholder="client@company.com"
              className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-[var(--muted)] sm:w-36">
            Role
            <select
              name="role"
              defaultValue="client"
              className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
            >
              {PROJECT_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Add"}
          </button>
          {error || info ? (
            <p
              className={`text-sm sm:basis-full ${
                error ? "text-[var(--danger)]" : "text-[var(--accent)]"
              }`}
              role={error ? "alert" : undefined}
            >
              {error ?? info}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
