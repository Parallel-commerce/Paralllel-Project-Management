"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { TimeEntry } from "@/types/database";

type TimeEntryWithProfile = TimeEntry & {
  profiles?:
    | { full_name: string | null; email: string; deleted_at?: string | null }
    | { full_name: string | null; email: string; deleted_at?: string | null }[]
    | null;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

async function requireInternal(projectId: string): Promise<
  | { error: string }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: { id: string };
      isAdmin: boolean;
    }
> {
  const { supabase, user } = await requireUser();
  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  const role = membership?.role;
  const allowed =
    !!profile?.is_platform_admin || role === "admin" || role === "member";

  if (!allowed) {
    return { error: "Time tracking is only available to the internal team." };
  }

  return {
    ok: true,
    supabase,
    user,
    isAdmin: role === "admin" || !!profile?.is_platform_admin,
  };
}

async function assertTaskInProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  listId: string,
  taskId: string,
): Promise<{ error: string } | { ok: true }> {
  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!list) {
    return { error: "List not found on this project." };
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("list_id", listId)
    .maybeSingle();

  if (!task) {
    return { error: "Task not found." };
  }

  return { ok: true };
}

function revalidateTime(projectId: string, listId: string) {
  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function startTimer(
  projectId: string,
  listId: string,
  taskId: string,
  formData?: FormData,
): Promise<{ error: string } | { success: true; entry: TimeEntry }> {
  const auth = await requireInternal(projectId);
  if (!("ok" in auth)) {
    return { error: auth.error };
  }

  const { supabase, user } = auth;
  const taskCheck = await assertTaskInProject(
    supabase,
    projectId,
    listId,
    taskId,
  );
  if (!("ok" in taskCheck)) {
    return { error: taskCheck.error };
  }

  const description = String(formData?.get("description") ?? "").trim();

  const { data: existing } = await supabase
    .from("time_entries")
    .select("id, task_id")
    .eq("user_id", user.id)
    .is("ended_at", null)
    .maybeSingle();

  if (existing) {
    if (existing.task_id === taskId) {
      return { error: "You already have a timer running on this task." };
    }
    return {
      error: "You already have a timer running on another task. Stop it first.",
    };
  }

  const startedAt = new Date().toISOString();
  const { data: entry, error } = await supabase
    .from("time_entries")
    .insert({
      project_id: projectId,
      task_id: taskId,
      user_id: user.id,
      description: description || null,
      started_at: startedAt,
      ended_at: null,
      duration_seconds: null,
      source: "timer",
    })
    .select(
      "id, project_id, user_id, task_id, description, started_at, ended_at, duration_seconds, source, created_at, updated_at",
    )
    .single();

  if (error || !entry) {
    return { error: error?.message ?? "Could not start timer." };
  }

  revalidateTime(projectId, listId);
  return { success: true, entry };
}

export async function stopTimer(
  projectId: string,
  listId: string,
  taskId: string,
  entryId?: string,
): Promise<{ error: string } | { success: true; durationSeconds: number }> {
  const auth = await requireInternal(projectId);
  if (!("ok" in auth)) {
    return { error: auth.error };
  }

  const { supabase, user, isAdmin } = auth;

  let query = supabase
    .from("time_entries")
    .select("id, started_at, user_id, task_id")
    .eq("project_id", projectId)
    .eq("task_id", taskId)
    .is("ended_at", null);

  if (entryId) {
    query = query.eq("id", entryId);
  } else {
    query = query.eq("user_id", user.id);
  }

  const { data: running, error: findError } = await query.maybeSingle();

  if (findError) {
    return { error: findError.message };
  }
  if (!running) {
    return { error: "No running timer found on this task." };
  }

  if (running.user_id !== user.id && !isAdmin) {
    return { error: "You can only stop your own timer." };
  }

  const endedAt = new Date();
  const startedAt = new Date(running.started_at);
  const durationSeconds = Math.max(
    1,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
  );

  const { error } = await supabase
    .from("time_entries")
    .update({
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq("id", running.id);

  if (error) {
    return { error: error.message };
  }

  revalidateTime(projectId, listId);
  return { success: true, durationSeconds };
}

export async function addManualTimeEntry(
  projectId: string,
  listId: string,
  taskId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const auth = await requireInternal(projectId);
  if (!("ok" in auth)) {
    return { error: auth.error };
  }

  const { supabase, user } = auth;
  const taskCheck = await assertTaskInProject(
    supabase,
    projectId,
    listId,
    taskId,
  );
  if (!("ok" in taskCheck)) {
    return { error: taskCheck.error };
  }

  const description = String(formData.get("description") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const hours = Number(formData.get("hours") ?? 0);
  const minutes = Number(formData.get("minutes") ?? 0);

  if (!date) {
    return { error: "Date is required." };
  }
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes >= 60
  ) {
    return { error: "Enter valid hours and minutes." };
  }

  const durationSeconds = Math.round(hours * 3600 + minutes * 60);
  if (durationSeconds <= 0) {
    return { error: "Duration must be greater than zero." };
  }

  const startedAt = new Date(`${date}T09:00:00`);
  if (Number.isNaN(startedAt.getTime())) {
    return { error: "Invalid date." };
  }
  const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

  const { error } = await supabase.from("time_entries").insert({
    project_id: projectId,
    task_id: taskId,
    user_id: user.id,
    description: description || null,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
    source: "manual",
  });

  if (error) {
    return { error: error.message };
  }

  revalidateTime(projectId, listId);
  return { success: true };
}

export async function listTaskTimeEntries(
  projectId: string,
  listId: string,
  taskId: string,
) {
  const access = await requireInternal(projectId);
  if ("error" in access) {
    return { error: access.error, entries: [] as TimeEntryWithProfile[] };
  }

  const { supabase } = access;
  const taskCheck = await assertTaskInProject(
    supabase,
    projectId,
    listId,
    taskId,
  );
  if ("error" in taskCheck) {
    return { error: taskCheck.error, entries: [] as TimeEntryWithProfile[] };
  }

  const { data, error } = await supabase
    .from("time_entries")
    .select(
      "id, project_id, user_id, task_id, description, started_at, ended_at, duration_seconds, source, created_at, updated_at, profiles(full_name, email, deleted_at)",
    )
    .eq("task_id", taskId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false });

  if (error) {
    return { error: error.message, entries: [] as TimeEntryWithProfile[] };
  }

  return { entries: (data ?? []) as TimeEntryWithProfile[] };
}

export async function deleteTimeEntry(
  projectId: string,
  listId: string,
  taskId: string,
  entryId: string,
): Promise<{ error: string } | { success: true }> {
  const auth = await requireInternal(projectId);
  if (!("ok" in auth)) {
    return { error: auth.error };
  }

  const { supabase, user, isAdmin } = auth;

  const { data: entry } = await supabase
    .from("time_entries")
    .select("id, user_id")
    .eq("id", entryId)
    .eq("project_id", projectId)
    .eq("task_id", taskId)
    .maybeSingle();

  if (!entry) {
    return { error: "Time entry not found." };
  }

  if (entry.user_id !== user.id && !isAdmin) {
    return { error: "You can only delete your own time entries." };
  }

  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", entryId)
    .eq("task_id", taskId)
    .eq("project_id", projectId);

  if (error) {
    return { error: error.message };
  }

  revalidateTime(projectId, listId);
  return { success: true };
}
