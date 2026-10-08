"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { logActivity, notifyUser } from "@/lib/notify";
import type { ListVisibility } from "@/types/database";

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 8000;

function subtaskLink(
  projectId: string,
  listId: string,
  taskId: string,
  subtaskId: string,
) {
  return `/projects/${projectId}/lists/${listId}?task=${taskId}&subtask=${subtaskId}`;
}

function revalidateSubtaskSurfaces(projectId: string, listId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath("/tasks");
  revalidatePath("/home");
}

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

async function loadParent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  taskId: string,
) {
  const { data: task } = await supabase
    .from("tasks")
    .select("id, list_id, project_id")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!task) return null;

  const { data: list } = await supabase
    .from("lists")
    .select("id, visibility")
    .eq("id", task.list_id)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!list) return null;

  return { task, list };
}

function parseTitle(raw: string): { title: string } | { error: string } {
  const title = raw.trim();
  if (!title) return { error: "Task is required." };
  if (title.length > TITLE_MAX) {
    return { error: `Task must be ${TITLE_MAX} characters or fewer.` };
  }
  return { title };
}

function parseDescription(raw: string): { description: string | null } | { error: string } {
  const description = raw.trim();
  if (!description) return { description: null };
  if (description.length > DESCRIPTION_MAX) {
    return { error: `Description must be ${DESCRIPTION_MAX} characters or fewer.` };
  }
  return { description };
}

function parseDueDate(raw: string): { dueDate: string | null } | { error: string } {
  const dueDate = raw.trim();
  if (!dueDate) return { dueDate: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { error: "Due date must be a valid date." };
  }
  const parsed = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dueDate) {
    return { error: "Due date must be a valid date." };
  }
  return { dueDate };
}

async function resolveAssignee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  assignedToRaw: string,
): Promise<{ assignedTo: string | null } | { error: string }> {
  const assignedTo = assignedToRaw.trim();
  if (!assignedTo) return { assignedTo: null };

  const { data } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", assignedTo)
    .maybeSingle();

  if (!data) {
    return { error: "Assignee must be a member of this project." };
  }

  return { assignedTo };
}

function readFields(formData: FormData) {
  const title = parseTitle(String(formData.get("title") ?? ""));
  if ("error" in title) return title;
  const description = parseDescription(String(formData.get("description") ?? ""));
  if ("error" in description) return description;
  const due = parseDueDate(String(formData.get("due_date") ?? ""));
  if ("error" in due) return due;
  return {
    title: title.title,
    description: description.description,
    dueDate: due.dueDate,
    assignedToRaw: String(formData.get("assigned_to") ?? ""),
  };
}

export async function listTaskSubtasks(projectId: string, taskId: string) {
  const { supabase } = await requireUser();
  const parent = await loadParent(supabase, projectId, taskId);
  if (!parent) return { error: "Task not found." };

  const { data, error } = await supabase
    .from("task_subtasks")
    .select(
      "id, task_id, title, description, assigned_to, due_date, created_by, completed_at",
    )
    .eq("task_id", taskId)
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };

  const assigneeIds = [
    ...new Set(
      (data ?? [])
        .map((row) => row.assigned_to)
        .filter((value): value is string => !!value),
    ),
  ];

  const { data: people } =
    assigneeIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, email, full_name, deleted_at")
          .in("id", assigneeIds)
      : { data: [] as { id: string; email: string; full_name: string | null; deleted_at: string | null }[] };

  const profileById = Object.fromEntries(
    (people ?? []).map((person) => [person.id, person]),
  );

  return {
    subtasks: (data ?? []).map((row) => ({
      id: row.id,
      task_id: row.task_id,
      title: row.title,
      description: row.description,
      assigned_to: row.assigned_to,
      due_date: row.due_date,
      created_by: row.created_by,
      completed_at: row.completed_at,
      assignee: row.assigned_to
        ? (profileById[row.assigned_to] ?? null)
        : null,
    })),
  };
}

export async function createTaskSubtask(
  projectId: string,
  taskId: string,
  formData: FormData,
) {
  const { supabase, user } = await requireUser();
  const fields = readFields(formData);
  if ("error" in fields) return { error: fields.error };

  const parent = await loadParent(supabase, projectId, taskId);
  if (!parent) return { error: "Task not found." };

  const assignee = await resolveAssignee(supabase, projectId, fields.assignedToRaw);
  if ("error" in assignee) return { error: assignee.error };

  const { data: subtask, error } = await supabase
    .from("task_subtasks")
    .insert({
      task_id: taskId,
      title: fields.title,
      description: fields.description,
      due_date: fields.dueDate,
      assigned_to: assignee.assignedTo,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !subtask) {
    return { error: error?.message ?? "Could not add subtask." };
  }

  const visibility = parent.list.visibility as ListVisibility;
  const clientVisible = visibility === "public";
  const link = subtaskLink(projectId, parent.task.list_id, taskId, subtask.id);

  if (assignee.assignedTo && assignee.assignedTo !== user.id) {
    await notifyUser({
      userId: assignee.assignedTo,
      type: "subtask_assigned",
      title: `Assigned: ${fields.title}`,
      body: "You were assigned a subtask.",
      link,
    });
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "task_subtask",
    entityId: subtask.id,
    action: "created",
    summary: `Added subtask “${fields.title}”`,
    metadata: {
      task_id: taskId,
      list_id: parent.task.list_id,
      list_visibility: visibility,
      assigned_to: assignee.assignedTo,
      due_date: fields.dueDate,
    },
    clientVisible,
  });

  revalidateSubtaskSurfaces(projectId, parent.task.list_id);
  return { success: true, id: subtask.id as string };
}

export async function updateTaskSubtask(
  projectId: string,
  taskId: string,
  subtaskId: string,
  formData: FormData,
) {
  const { supabase, user } = await requireUser();
  const fields = readFields(formData);
  if ("error" in fields) return { error: fields.error };

  const parent = await loadParent(supabase, projectId, taskId);
  if (!parent) return { error: "Task not found." };

  const assignee = await resolveAssignee(supabase, projectId, fields.assignedToRaw);
  if ("error" in assignee) return { error: assignee.error };

  const { data: before } = await supabase
    .from("task_subtasks")
    .select("id, title, assigned_to, completed_at")
    .eq("id", subtaskId)
    .eq("task_id", taskId)
    .maybeSingle();

  if (!before) return { error: "Subtask not found." };

  const completed = String(formData.get("completed") ?? "") === "1";
  const completedAt = completed ? (before.completed_at ?? new Date().toISOString()) : null;

  const { data: updated, error } = await supabase
    .from("task_subtasks")
    .update({
      title: fields.title,
      description: fields.description,
      due_date: fields.dueDate,
      assigned_to: assignee.assignedTo,
      completed_at: completedAt,
    })
    .eq("id", subtaskId)
    .eq("task_id", taskId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return { error: error?.message ?? "Could not update subtask." };
  }

  const visibility = parent.list.visibility as ListVisibility;
  const clientVisible = visibility === "public";

  if (
    assignee.assignedTo &&
    assignee.assignedTo !== before.assigned_to &&
    assignee.assignedTo !== user.id
  ) {
    await notifyUser({
      userId: assignee.assignedTo,
      type: "subtask_assigned",
      title: `Assigned: ${fields.title}`,
      body: "You were assigned a subtask.",
      link: subtaskLink(projectId, parent.task.list_id, taskId, subtaskId),
    });
  }

  const completionChanged = !!before.completed_at !== completed;
  const summary = completionChanged
    ? completed
      ? `Completed subtask “${fields.title}”`
      : `Reopened subtask “${fields.title}”`
    : `Updated subtask “${fields.title}”`;

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "task_subtask",
    entityId: subtaskId,
    action: completionChanged ? (completed ? "completed" : "reopened") : "updated",
    summary,
    metadata: {
      task_id: taskId,
      list_id: parent.task.list_id,
      list_visibility: visibility,
      assigned_to: assignee.assignedTo,
      due_date: fields.dueDate,
    },
    clientVisible,
  });

  revalidateSubtaskSurfaces(projectId, parent.task.list_id);
  return { success: true };
}

export async function setTaskSubtaskCompleted(
  projectId: string,
  taskId: string,
  subtaskId: string,
  completed: boolean,
) {
  const { supabase, user } = await requireUser();
  const parent = await loadParent(supabase, projectId, taskId);
  if (!parent) return { error: "Task not found." };

  const { data: before } = await supabase
    .from("task_subtasks")
    .select("id, title, completed_at")
    .eq("id", subtaskId)
    .eq("task_id", taskId)
    .maybeSingle();

  if (!before) return { error: "Subtask not found." };
  if (!!before.completed_at === completed) return { success: true };

  const { error } = await supabase
    .from("task_subtasks")
    .update({
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", subtaskId)
    .eq("task_id", taskId);

  if (error) return { error: error.message };

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "task_subtask",
    entityId: subtaskId,
    action: completed ? "completed" : "reopened",
    summary: completed
      ? `Completed subtask “${before.title}”`
      : `Reopened subtask “${before.title}”`,
    metadata: {
      task_id: taskId,
      list_id: parent.task.list_id,
      list_visibility: parent.list.visibility,
    },
    clientVisible: parent.list.visibility === "public",
  });

  revalidateSubtaskSurfaces(projectId, parent.task.list_id);
  return { success: true };
}

export async function deleteTaskSubtask(
  projectId: string,
  taskId: string,
  subtaskId: string,
) {
  const { supabase, user } = await requireUser();
  const parent = await loadParent(supabase, projectId, taskId);
  if (!parent) return { error: "Task not found." };

  const { data: before } = await supabase
    .from("task_subtasks")
    .select("id, title")
    .eq("id", subtaskId)
    .eq("task_id", taskId)
    .maybeSingle();

  if (!before) return { error: "Subtask not found." };

  const { data: deleted, error } = await supabase
    .from("task_subtasks")
    .delete()
    .eq("id", subtaskId)
    .eq("task_id", taskId)
    .select("id")
    .maybeSingle();

  if (error || !deleted) {
    return { error: error?.message ?? "Could not delete subtask." };
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "task_subtask",
    entityId: subtaskId,
    action: "deleted",
    summary: `Deleted subtask “${before.title}”`,
    metadata: {
      task_id: taskId,
      list_id: parent.task.list_id,
      list_visibility: parent.list.visibility,
    },
    clientVisible: parent.list.visibility === "public",
  });

  revalidateSubtaskSurfaces(projectId, parent.task.list_id);
  return { success: true };
}
