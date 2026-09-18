import Link from "next/link";
import { notFound } from "next/navigation";

import { StoreDashboard } from "@/components/store-dashboard";
import { StoreSetupForm } from "@/components/store-setup-form";
import { requireSessionUser } from "@/lib/auth";
import { toPublicConnection } from "@/lib/shopify/connection";
import type {
  ProjectRole,
  ProjectShopifyConnection,
  ProjectStoreSnapshot,
} from "@/types/database";

export const maxDuration = 60;

export default async function ProjectStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, user } = await requireSessionUser();

  const [{ data: project }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase.from("projects").select("id, name").eq("id", id).maybeSingle(),
      supabase
        .from("project_members")
        .select("role")
        .eq("project_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  if (!project) {
    notFound();
  }

  const role = (membership?.role ?? "client") as ProjectRole;
  const isAdmin = role === "admin" || !!profile?.is_platform_admin;

  const [{ data: connectionRow }, { data: snapshotRow }] = await Promise.all([
    isAdmin
      ? supabase
          .from("project_shopify_connections")
          .select("*")
          .eq("project_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("project_store_snapshots")
      .select("*")
      .eq("project_id", id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const connection = connectionRow
    ? toPublicConnection(connectionRow as ProjectShopifyConnection)
    : null;
  const snapshot = (snapshotRow as ProjectStoreSnapshot | null) ?? null;

  return (
    <main className="app-container py-6 sm:py-10">
      <Link
        href={`/projects/${id}`}
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        ← {project.name}
      </Link>
      <h1 className="mt-3 font-display text-3xl tracking-tight">Store</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {isAdmin
          ? "Connect this project’s Shopify store and refresh the snapshot when you want an update."
          : "Live snapshot of this store’s recent orders, sales, and published theme."}
      </p>

      {query.connected === "1" && isAdmin ? (
        <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
          Shopify store connected.
        </p>
      ) : null}
      {query.error && isAdmin ? (
        <p className="mt-4 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--danger)]">
          {query.error}
        </p>
      ) : null}

      <div className="mt-8 space-y-8">
        {snapshot ? (
          <StoreDashboard snapshot={snapshot} />
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--column)]/60 px-6 py-12 text-center">
            <p className="font-medium">Store dashboard isn’t available yet</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {isAdmin
                ? "Save the custom app credentials, connect the store, then sync a snapshot."
                : "Your Parallel team will share store metrics here once the store is connected."}
            </p>
          </div>
        )}

        {isAdmin ? (
          <StoreSetupForm projectId={id} connection={connection} />
        ) : null}
      </div>
    </main>
  );
}
