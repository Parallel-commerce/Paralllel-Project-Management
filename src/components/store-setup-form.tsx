"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  disconnectShopifyStore,
  saveShopifyCredentials,
  startShopifyConnect,
  syncShopifySnapshot,
} from "@/lib/actions/store";
import type { StoreConnectionPublic } from "@/types/database";

const inputClass =
  "rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2";

export function StoreSetupForm({
  projectId,
  connection,
}: {
  projectId: string;
  connection: StoreConnectionPublic | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const connected = connection?.has_access_token && connection.status === "connected";

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Shopify connection</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Create a custom-distribution app for this one store in the Shopify Dev
        Dashboard, then paste its credentials here. Clients never see this.
        New connects request <code>read_orders</code>, <code>read_themes</code>,
        and <code>read_reports</code>.
      </p>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          setError(null);
          setSaved(false);
          startTransition(async () => {
            const result = await saveShopifyCredentials(
              projectId,
              new FormData(form),
            );
            if ("error" in result) {
              setError(result.error);
              return;
            }
            setSaved(true);
            router.refresh();
          });
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)] sm:col-span-2">
          Shop domain
          <input
            name="shop_domain"
            required
            defaultValue={connection?.shop_domain ?? ""}
            placeholder="store.myshopify.com"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Client ID
          <input
            name="client_id"
            required
            defaultValue={connection?.client_id ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
          Client secret
          <input
            name="client_secret"
            type="password"
            autoComplete="off"
            required={!connection?.has_client_secret}
            placeholder={
              connection?.has_client_secret
                ? "Saved — enter a new secret to replace it"
                : undefined
            }
            className={inputClass}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save credentials"}
          </button>
          {saved ? (
            <p className="text-sm text-[var(--muted)]">Saved.</p>
          ) : null}
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <form
          action={() => {
            setError(null);
            startTransition(async () => {
              const result = await startShopifyConnect(projectId);
              if (result && "error" in result) {
                setError(result.error);
              }
            });
          }}
        >
          <button
            type="submit"
            disabled={pending || !connection}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {connected ? "Reconnect store" : "Connect store"}
          </button>
        </form>
        <form
          action={() => {
            setError(null);
            startTransition(async () => {
              const result = await syncShopifySnapshot(projectId);
              if (result && "error" in result) {
                setError(result.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          <button
            type="submit"
            disabled={pending || !connection?.has_access_token}
            className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
          >
            {pending ? "Syncing…" : "Sync now"}
          </button>
        </form>
        {connection?.has_access_token ? (
          <form
            action={() => {
              if (!window.confirm("Disconnect this Shopify store?")) return;
              setError(null);
              startTransition(async () => {
                const result = await disconnectShopifyStore(projectId);
                if (result && "error" in result) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              Disconnect
            </button>
          </form>
        ) : null}
      </div>

      {connected ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Sync now refreshes the live 7 and 30 day totals and records yesterday.
          After that, a nightly job captures each completed shop day after
          midnight.
        </p>
      ) : null}

      {connection?.status ? (
        <p className="mt-3 text-xs uppercase tracking-wide text-[var(--muted)]">
          Status: {connection.status.replace("_", " ")}
          {connection.scopes ? ` · Scopes: ${connection.scopes}` : ""}
        </p>
      ) : null}

      {connected &&
      connection.scopes &&
      !connection.scopes.split(/[,\s]+/).includes("read_reports") ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Store reports on the Reports page use ShopifyQL when{" "}
          <code>read_reports</code> is on this app. Add it, then reconnect, so
          sessions and conversion match what Claude can query.
        </p>
      ) : null}

      {error || connection?.last_error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error ?? connection?.last_error}
        </p>
      ) : null}
    </section>
  );
}
