"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  disconnectShopifyStore,
  saveShopifyCredentials,
  saveThemeGit,
  startShopifyConnect,
  syncShopifySnapshot,
} from "@/lib/actions/store";
import type { ProjectThemeGit, StoreConnectionPublic } from "@/types/database";

const inputClass =
  "rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2";

export function StoreSetupForm({
  projectId,
  connection,
  themeGit,
}: {
  projectId: string;
  connection: StoreConnectionPublic | null;
  themeGit: ProjectThemeGit | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [savedShopify, setSavedShopify] = useState(false);
  const [savedTheme, setSavedTheme] = useState(false);
  const [savingShopify, startShopifySave] = useTransition();
  const [savingTheme, startThemeSave] = useTransition();
  const [connecting, startConnect] = useTransition();
  const [syncing, startSync] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const connected =
    connection?.has_access_token && connection.status === "connected";
  const shopifyBusy = savingShopify || connecting || syncing || disconnecting;

  return (
    <>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-medium">Shopify</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create a custom-distribution app for this one store in the Shopify Dev
          Dashboard, then paste its credentials here. Clients never see this.
          New connects request <code>read_orders</code>,{" "}
          <code>read_themes</code>, and <code>read_reports</code>.
        </p>

        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            setError(null);
            setSavedShopify(false);
            startShopifySave(async () => {
              const result = await saveShopifyCredentials(
                projectId,
                new FormData(form),
              );
              if ("error" in result) {
                setError(result.error);
                return;
              }
              setSavedShopify(true);
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
              disabled={shopifyBusy}
              className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              {savingShopify ? "Saving…" : "Save credentials"}
            </button>
            {savedShopify ? (
              <p className="text-sm text-[var(--muted)]">Saved.</p>
            ) : null}
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          <form
            action={() => {
              setError(null);
              startConnect(async () => {
                const result = await startShopifyConnect(projectId);
                if (result && "error" in result) {
                  setError(result.error);
                }
              });
            }}
          >
            <button
              type="submit"
              disabled={shopifyBusy || !connection}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {connecting
                ? "Connecting…"
                : connected
                  ? "Reconnect store"
                  : "Connect store"}
            </button>
          </form>
          <button
            type="button"
            disabled={shopifyBusy || !connection?.has_access_token}
            onClick={() => {
              setError(null);
              startSync(async () => {
                const result = await syncShopifySnapshot(projectId);
                if (result && "error" in result) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
            className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          {connection?.has_access_token ? (
            <form
              action={() => {
                if (!window.confirm("Disconnect this Shopify store?")) return;
                setError(null);
                startDisconnect(async () => {
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
                disabled={shopifyBusy}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-[var(--surface-2)] disabled:opacity-60"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </form>
          ) : null}
        </div>

        {connected ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Sync now refreshes the live 7 and 30 day totals and records
            yesterday. After that, a nightly job captures each completed shop
            day after midnight.
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
            Store reports and the Store cards use ShopifyQL when{" "}
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

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-medium">Theme git</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Live theme GitHub repo. A push to this branch is production. Store and
          tasks read commits from here.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            setError(null);
            setSavedTheme(false);
            startThemeSave(async () => {
              const result = await saveThemeGit(projectId, new FormData(form));
              if ("error" in result) {
                setThemeError(result.error);
                return;
              }
              setThemeError(null);
              setSavedTheme(true);
              router.refresh();
            });
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Repo
            <input
              name="theme_repo"
              defaultValue={themeGit?.repo ?? ""}
              placeholder="Parallel-commerce/forty_v2"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            Branch
            <input
              name="theme_branch"
              defaultValue={themeGit?.branch ?? "main"}
              placeholder="main"
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={savingTheme}
              className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              {savingTheme ? "Saving…" : "Save theme repo"}
            </button>
            {savedTheme ? (
              <p className="text-sm text-[var(--muted)]">Saved.</p>
            ) : null}
          </div>
        </form>
        {themeError ? (
          <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
            {themeError}
          </p>
        ) : null}
      </section>
    </>
  );
}
