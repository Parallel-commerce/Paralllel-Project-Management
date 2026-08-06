"use client";

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
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isAdmin) {
    return (
      <section>
        <h2 className="font-medium">People</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-2"
            >
              <span>{personDisplayName(m.profile, m.profile?.email ?? "Someone")}</span>
              <span className="text-[var(--muted)] capitalize">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-medium">People</h2>
      <ul className="mt-3 space-y-3 text-sm">
        {members.map((m) => (
          <li key={m.user_id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p>{personDisplayName(m.profile, m.profile?.email ?? "Someone")}</p>
                <p className="text-xs text-[var(--muted)]">
                  {m.profile?.email}
                </p>
              </div>
              {m.user_id !== currentUserId ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await removeMember(projectId, m.user_id);
                      setError(result?.error ?? null);
                    });
                  }}
                  className="text-xs text-[var(--danger)] hover:underline"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <select
              value={m.role}
              disabled={pending}
              onChange={(event) => {
                const role = event.target.value as ProjectRole;
                startTransition(async () => {
                  const result = await updateMemberRole(
                    projectId,
                    m.user_id,
                    role,
                  );
                  setError(result?.error ?? null);
                });
              }}
              className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm outline-none ring-[var(--accent)] focus:ring-2"
            >
              {PROJECT_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      {invites.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-[var(--muted)]">
            Pending invites
          </h3>
          <ul className="mt-2 space-y-2 text-sm">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-2"
              >
                <div>
                  <p>{invite.email}</p>
                  <p className="text-xs text-[var(--muted)] capitalize">
                    {invite.role}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await cancelInvite(projectId, invite.id);
                      setError(result?.error ?? null);
                    });
                  }}
                  className="text-xs text-[var(--danger)] hover:underline"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        className="mt-5 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await inviteMember(projectId, formData);
            if (result?.error) {
              setError(result.error);
              setInfo(null);
            } else {
              setError(null);
              setInfo(result?.message ?? "Person added.");
              event.currentTarget.reset();
            }
          });
        }}
      >
        <p className="text-sm font-medium">Invite by email</p>
        <input
          name="email"
          type="email"
          required
          placeholder="client@company.com"
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
        />
        <select
          name="role"
          defaultValue="client"
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
        >
          {PROJECT_ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add person"}
        </button>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {info ? <p className="text-sm text-[var(--accent)]">{info}</p> : null}
      </form>
    </section>
  );
}
