"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createContact,
  deleteContact,
  updateContact,
} from "@/lib/actions/crm";
import type { Contact } from "@/types/database";

const fieldClass =
  "rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2";

function ContactFields({
  contact,
}: {
  contact?: Contact;
}) {
  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        Name
        <input
          name="full_name"
          required
          defaultValue={contact?.full_name ?? ""}
          className={fieldClass}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Email
          <input
            type="email"
            name="email"
            defaultValue={contact?.email ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Phone
          <input
            name="phone"
            defaultValue={contact?.phone ?? ""}
            className={fieldClass}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        Title
        <input
          name="title"
          defaultValue={contact?.title ?? ""}
          placeholder="Buying manager"
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        LinkedIn
        <input
          name="linkedin_url"
          defaultValue={contact?.linkedin_url ?? ""}
          placeholder="https://www.linkedin.com/in/"
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
        Notes
        <textarea
          name="notes"
          rows={2}
          defaultValue={contact?.notes ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
        <input
          type="checkbox"
          name="is_primary"
          value="1"
          defaultChecked={contact?.is_primary ?? false}
        />
        Primary contact
      </label>
    </>
  );
}

function ContactCard({
  companyId,
  contact,
}: {
  companyId: string;
  contact: Contact;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium tracking-tight">
              {contact.full_name}
              {contact.is_primary ? (
                <span className="ml-2 text-xs font-normal text-[var(--accent)]">
                  Primary
                </span>
              ) : null}
            </p>
            {contact.title ? (
              <p className="mt-0.5 text-sm text-[var(--muted)]">{contact.title}</p>
            ) : null}
            <p className="mt-1 text-sm text-[var(--muted)]">
              {[contact.email, contact.phone].filter(Boolean).join(" · ") ||
                "No email or phone"}
            </p>
            {contact.linkedin_url ? (
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-[var(--accent)] hover:underline"
              >
                LinkedIn
              </a>
            ) : null}
            {contact.notes ? (
              <p className="mt-1 text-sm text-[var(--muted)]">{contact.notes}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="text-sm text-[var(--accent)] hover:underline"
              onClick={() => {
                setEditing(true);
                setError(null);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              disabled={pending}
              className="text-sm text-[var(--danger)] hover:underline disabled:opacity-60"
              onClick={() => {
                if (!window.confirm(`Remove ${contact.full_name}?`)) return;
                startTransition(async () => {
                  const result = await deleteContact(companyId, contact.id);
                  if (result?.error) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              Remove
            </button>
          </div>
        </div>
        {error ? (
          <p className="mt-2 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            const result = await updateContact(companyId, contact.id, formData);
            if (result?.error) {
              setError(result.error);
              return;
            }
            setEditing(false);
            router.refresh();
          });
        }}
      >
        <ContactFields contact={contact} />
        {error ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}

export function CompanyContacts({
  companyId,
  contacts,
}: {
  companyId: string;
  contacts: Contact[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section>
      <h2 className="font-medium">Contacts</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        People at this company. Emails can be invited as clients when you create
        a project. Look up the company to fill LinkedIn profiles when they can
        be found.
      </p>

      <form
        className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          setError(null);
          startTransition(async () => {
            const result = await createContact(companyId, formData);
            if (result?.error) {
              setError(result.error);
              return;
            }
            form.reset();
            router.refresh();
          });
        }}
      >
        <p className="text-sm font-medium">Add contact</p>
        <ContactFields />
        {error ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add contact"}
        </button>
      </form>

      {contacts.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          No contacts yet. Add the people you talk to at this company.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              companyId={companyId}
              contact={contact}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
