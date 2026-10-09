"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  disconnectShopifyStore,
  saveShopifyCredentials,
  saveThemeGit,
  loadColourGroups,
  setColourGroupingEnabled,
  startShopifyConnect,
  syncColourGroups,
  syncShopifySnapshot,
} from "@/lib/actions/store";
import type { ColourGroupMemberList } from "@/lib/shopify/colour-groups";
import type { ProjectThemeGit, StoreConnectionPublic } from "@/types/database";

const inputClass =
  "rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2";

function ColourGroupList({
  groups,
  query,
  onQuery,
}: {
  groups: ColourGroupMemberList[];
  query: string;
  onQuery: (value: string) => void;
}) {
  const needle = query.trim().toLocaleLowerCase("en-GB");
  const visible = needle
    ? groups.filter((group) => {
        if (group.name.toLocaleLowerCase("en-GB").includes(needle)) return true;
        return group.products.some((product) =>
          product.toLocaleLowerCase("en-GB").includes(needle),
        );
      })
    : groups;
  const productCount = groups.reduce((count, group) => count + group.products.length, 0);

  return (
    <div className="mt-3">
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search groups or products"
        className={inputClass}
      />
      <p className="mt-2 text-sm text-[var(--muted)]">
        {groups.length} groups in Shopify, {productCount} products
        {needle ? `. ${visible.length} match` : ""}
      </p>
      <div className="mt-2 max-h-96 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] bg-white p-2">
        {visible.length ? (
          visible.map((group, index) => (
            <details key={`${group.name}-${index}`} className="rounded-md px-2 py-1">
              <summary className="cursor-pointer text-sm">
                {group.name}{" "}
                <span className="text-[var(--muted)]">({group.products.length})</span>
              </summary>
              {group.products.length ? (
                <ul className="mt-1 space-y-0.5 pb-1 pl-4 text-sm text-[var(--muted)]">
                  {group.products.map((product, productIndex) => (
                    <li key={`${product}-${productIndex}`}>{product}</li>
                  ))}
                </ul>
              ) : null}
              {group.products.length < 2 ? (
                <p className="pb-1 pl-4 text-sm text-[var(--muted)]">
                  {group.products.length === 1
                    ? "One colour is not a group. The next run removes it."
                    : "No products. The next run removes this group."}
                </p>
              ) : null}
              {group.truncated ? (
                <p className="pb-1 pl-4 text-sm text-[var(--muted)]">
                  This group has more products than the list shows.
                </p>
              ) : null}
            </details>
          ))
        ) : (
          <p className="px-2 py-1 text-sm text-[var(--muted)]">No matching groups.</p>
        )}
      </div>
    </div>
  );
}

function CopyUrlField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs text-[var(--foreground)]">
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
          className="shrink-0 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function StoreSetupForm({
  projectId,
  connection,
  themeGit,
  shopifyAppUrl,
  shopifyRedirectUrl,
}: {
  projectId: string;
  connection: StoreConnectionPublic | null;
  themeGit: ProjectThemeGit | null;
  shopifyAppUrl: string;
  shopifyRedirectUrl: string;
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
  const [togglingGrouping, startToggleGrouping] = useTransition();
  const [groupingProducts, startGroupingProducts] = useTransition();
  const [groupSummary, setGroupSummary] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [loadingGroups, startLoadingGroups] = useTransition();
  const [colourGroups, setColourGroups] = useState<ColourGroupMemberList[] | null>(
    null,
  );
  const [groupQuery, setGroupQuery] = useState("");

  const connected =
    connection?.has_access_token && connection.status === "connected";
  const shopifyBusy =
    savingShopify ||
    connecting ||
    syncing ||
    disconnecting ||
    togglingGrouping ||
    groupingProducts ||
    loadingGroups;
  const colourGroupingOn = Boolean(connection?.colour_grouping_enabled);
  const colourGroupingScopesReady = Boolean(
    connection?.scopes?.split(/[,\s]+/).includes("write_products") &&
      connection.scopes.split(/[,\s]+/).includes("write_metaobjects") &&
      connection.scopes.split(/[,\s]+/).includes("write_metaobject_definitions"),
  );

  return (
    <>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-medium">Shopify</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create a custom-distribution app for this one store in the Shopify Dev
          Dashboard, then paste its credentials here. Clients never see this.
          New connects request <code>read_orders</code>,{" "}
          <code>read_themes</code>, and <code>read_reports</code>.
          {colourGroupingOn ? (
            <>
              {" "}
              Colour grouping also requests <code>write_products</code>,{" "}
              <code>write_metaobjects</code>, and{" "}
              <code>write_metaobject_definitions</code> when you reconnect.
            </>
          ) : null}
        </p>

        <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-sm text-[var(--muted)]">
            Paste these into the custom app URL fields in the Dev Dashboard.
          </p>
          <CopyUrlField label="App URL" value={shopifyAppUrl} />
          <CopyUrlField
            label="Allowed redirection URL"
            value={shopifyRedirectUrl}
          />
        </div>

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

      {connected && connection ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-medium">Colour groups</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            A group is created when two or more colours share a name, such as{" "}
            <span className="text-[var(--foreground)]">Name (Colour)</span>. A single
            colour stays ungrouped. Each run adds a colour when another one of that
            name appears, removes products that have gone, and deletes a group that
            no longer has two colours. The summary names what was created, added,
            and removed.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={shopifyBusy}
              onClick={() => {
                setGroupError(null);
                setGroupSummary(null);
                startToggleGrouping(async () => {
                  const result = await setColourGroupingEnabled(
                    projectId,
                    !colourGroupingOn,
                  );
                  if ("error" in result) {
                    setGroupError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
              className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              {togglingGrouping
                ? "Saving…"
                : colourGroupingOn
                  ? "Turn off colour grouping"
                  : "Turn on colour grouping"}
            </button>
            {colourGroupingOn ? (
              <button
                type="button"
                disabled={shopifyBusy || !colourGroupingScopesReady}
                onClick={() => {
                  setGroupError(null);
                  setGroupSummary(null);
                  startGroupingProducts(async () => {
                    const result = await syncColourGroups(projectId);
                    if ("error" in result) {
                      setGroupError(result.error);
                      return;
                    }
                    setGroupSummary(result.summary);
                    router.refresh();
                  });
                }}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {groupingProducts ? "Grouping…" : "Group products now"}
              </button>
            ) : null}
          </div>
          {colourGroupingOn && !colourGroupingScopesReady ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Reconnect the store above. The app permissions are not on the
              current token yet, so grouping stays paused until then.
            </p>
          ) : null}
          {connection.colour_grouping_last_summary ? (
            <p className="mt-3 whitespace-pre-line text-sm text-[var(--muted)]">
              {`Last run${
                connection.colour_grouping_last_run_at
                  ? ` · ${new Date(connection.colour_grouping_last_run_at).toLocaleString("en-GB")}`
                  : ""
              }\n${connection.colour_grouping_last_summary}`}
            </p>
          ) : null}
          {groupSummary && groupSummary !== connection.colour_grouping_last_summary ? (
            <p className="mt-3 whitespace-pre-line text-sm text-[var(--muted)]">{groupSummary}</p>
          ) : null}
          {colourGroupingOn && colourGroupingScopesReady ? (
            <div className="mt-4">
              <button
                type="button"
                disabled={shopifyBusy}
                onClick={() => {
                  setGroupError(null);
                  startLoadingGroups(async () => {
                    const result = await loadColourGroups(projectId);
                    if ("error" in result) {
                      setGroupError(result.error);
                      setColourGroups(null);
                      return;
                    }
                    setColourGroups(result.groups);
                  });
                }}
                className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
              >
                {loadingGroups ? "Loading groups…" : "Show grouped products"}
              </button>
              {colourGroups ? (
                <ColourGroupList groups={colourGroups} query={groupQuery} onQuery={setGroupQuery} />
              ) : null}
            </div>
          ) : null}
          {groupError || connection.colour_grouping_last_error ? (
            <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
              {groupError ?? connection.colour_grouping_last_error}
            </p>
          ) : null}
        </section>
      ) : null}

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
