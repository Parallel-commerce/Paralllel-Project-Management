import { createClient } from "@/lib/supabase/server";
import type { ProjectRole } from "@/types/database";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function ActivityFeed({
  projectId,
  role,
}: {
  projectId: string;
  role: ProjectRole;
}) {
  const supabase = await createClient();
  const isClient = role === "client";

  const { data: events } = await supabase
    .from("activity_events")
    .select(
      "id, summary, action, created_at, actor_id, profiles!activity_events_actor_id_fkey(full_name, email)",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(isClient ? 40 : 25);

  // RLS already hides non-client_visible rows from clients; keep copy client-friendly.
  const visible = events ?? [];

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Activity</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {isClient
          ? "Recent progress shared on this project."
          : "Recent changes on this project."}
      </p>
      <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto">
        {visible.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">No activity yet.</li>
        ) : (
          visible.map((event) => {
            const profile = Array.isArray(event.profiles)
              ? event.profiles[0]
              : event.profiles;
            const actor =
              (profile?.full_name as string | null) ||
              (profile?.email as string | null) ||
              "Someone";
            return (
              <li
                key={event.id}
                className="border-t border-[var(--border)] pt-3 first:border-t-0 first:pt-0"
              >
                <p className="text-sm">{event.summary}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {actor} · {formatWhen(event.created_at)}
                </p>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
