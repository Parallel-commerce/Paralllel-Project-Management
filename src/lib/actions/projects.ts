"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  removeMemberFromProject,
  updateMemberRole as updateMemberRoleAction,
} from "@/lib/actions/users";
import { logActivity, notifyUser, sendInviteMagicLink } from "@/lib/notify";
import { PROJECT_LOGO_BUCKET } from "@/lib/project-logo";
import { projectTaskPrefix } from "@/lib/task-key";
import { TASK_ATTACHMENT_BUCKET } from "@/lib/task-attachments";
import type { ListVisibility, ProjectRole, TaskAttachment, TaskStatus } from "@/types/database";

const LOGO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

function taskDeepLink(projectId: string, listId: string, taskId: string) {
  return `/projects/${projectId}/lists/${listId}?task=${taskId}`;
}

function normalizeLinkUrl(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

async function getListVisibility(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listId: string,
) {
  const { data } = await supabase
    .from("lists")
    .select("visibility")
    .eq("id", listId)
    .maybeSingle();
  return (data?.visibility ?? "private") as ListVisibility;
}

async function resolveReporterId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  reportedByRaw: string,
  fallbackUserId: string,
): Promise<{ reportedBy: string } | { error: string }> {
  const reportedBy = reportedByRaw.trim() || fallbackUserId;
  const { data: membership } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", reportedBy)
    .maybeSingle();

  if (!membership) {
    return { error: "Reporter must be a member of this project." };
  }

  return { reportedBy };
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

export async function createProject(
  formData: FormData,
): Promise<{ error: string } | void> {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    return { error: "Project name is required." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  const { count: internalCount } = await supabase
    .from("project_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("role", ["admin", "member"]);

  if (!profile?.is_platform_admin && (internalCount ?? 0) === 0) {
    return {
      error:
        "Only Parallel team members can create projects. Ask an admin to invite you.",
    };
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      description: description || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create project." };
  }

  // Belt-and-suspenders: ensure creator is an admin member
  // (trigger should already insert this; ignore conflict if so).
  const { error: memberError } = await supabase.from("project_members").upsert(
    {
      project_id: data.id,
      user_id: user.id,
      role: "admin",
    },
    { onConflict: "project_id,user_id" },
  );

  if (memberError) {
    return {
      error: `Project created but membership failed: ${memberError.message}`,
    };
  }

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProject(projectId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const removeLogo = String(formData.get("remove_logo") ?? "") === "1";
  const logo = formData.get("logo");

  if (!name) {
    return { error: "Project name is required." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("projects")
    .select("logo_path")
    .eq("id", projectId)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  let logoPath = existing?.logo_path ?? null;

  if (removeLogo && logoPath) {
    await supabase.storage.from(PROJECT_LOGO_BUCKET).remove([logoPath]);
    logoPath = null;
  }

  if (logo instanceof File && logo.size > 0) {
    if (!LOGO_MIME_TYPES.has(logo.type)) {
      return { error: "Logo must be a JPEG, PNG, WebP, or GIF." };
    }
    if (logo.size > LOGO_MAX_BYTES) {
      return { error: "Logo must be 2MB or smaller." };
    }

    const extension =
      logo.type === "image/jpeg"
        ? "jpg"
        : logo.type === "image/png"
          ? "png"
          : logo.type === "image/webp"
            ? "webp"
            : "gif";
    const nextPath = `${projectId}/logo.${extension}`;

    if (logoPath && logoPath !== nextPath) {
      await supabase.storage.from(PROJECT_LOGO_BUCKET).remove([logoPath]);
    }

    const { error: uploadError } = await supabase.storage
      .from(PROJECT_LOGO_BUCKET)
      .upload(nextPath, logo, {
        upsert: true,
        contentType: logo.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      return { error: uploadError.message };
    }

    logoPath = nextPath;
  }

  const { error } = await supabase
    .from("projects")
    .update({
      name,
      description: description || null,
      logo_path: logoPath,
    })
    .eq("id", projectId);

  if (error) {
    return { error: error.message };
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "project",
    entityId: projectId,
    action: "updated",
    summary: `Updated project “${name}”`,
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

export async function inviteMember(projectId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "client") as ProjectRole;

  if (!email) {
    return { error: "Email is required." };
  }

  const { data: inviteMatch, error: inviteMatchError } = await supabase.rpc(
    "find_profile_by_invite_email",
    { p_email: email },
  );
  if (inviteMatchError) {
    return { error: inviteMatchError.message };
  }
  const matched = Array.isArray(inviteMatch) ? inviteMatch[0] : inviteMatch;
  if (matched?.is_deleted) {
    return {
      error:
        "That email belongs to a removed user. Ask a platform admin to reinstate them from Users → Removed.",
    };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();

  const { error } = await supabase.from("project_invites").insert({
    project_id: projectId,
    email,
    role,
    invited_by: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That email already has a pending invite." };
    }
    return { error: error.message };
  }

  const magic = await sendInviteMagicLink(email, `/projects/${projectId}`);
  if (magic.error) {
    // Membership/invite still saved; surface soft warning
    console.error(magic.error);
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile) {
    await notifyUser({
      userId: existingProfile.id,
      email: existingProfile.email,
      type: "project_invite",
      title: `You've been added to ${project?.name ?? "a project"}`,
      body: `You were added as ${role}. Sign in to open the project.`,
      link: `/projects/${projectId}`,
    });
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "member",
    entityId: existingProfile?.id ?? null,
    action: "invited",
    summary: `Invited ${email} as ${role}`,
    metadata: { email, role },
  });

  revalidatePath(`/projects/${projectId}`);
  return {
    success: true,
    message: magic.error
      ? "Person added, but the magic-link email failed to send."
      : "Person added and a sign-in email was sent.",
  };
}

export async function removeMember(projectId: string, userId: string) {
  return removeMemberFromProject(projectId, userId);
}

export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
) {
  return updateMemberRoleAction(projectId, userId, role);
}

export async function cancelInvite(projectId: string, inviteId: string) {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("project_invites")
    .delete()
    .eq("id", inviteId)
    .eq("project_id", projectId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

export async function createList(projectId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const visibility = String(
    formData.get("visibility") ?? "public",
  ) as ListVisibility;

  if (!name) {
    return { error: "List name is required." };
  }

  const { data, error } = await supabase
    .from("lists")
    .insert({
      project_id: projectId,
      name,
      visibility,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/lists/${data.id}`);
}

export async function updateList(
  projectId: string,
  listId: string,
  formData: FormData,
) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const visibility = String(
    formData.get("visibility") ?? "public",
  ) as ListVisibility;

  if (!name) {
    return { error: "List name is required." };
  }

  const { error } = await supabase
    .from("lists")
    .update({ name, visibility })
    .eq("id", listId)
    .eq("project_id", projectId);

  if (error) {
    return { error: error.message };
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "list",
    entityId: listId,
    action: "updated",
    summary: `Updated list “${name}” (${visibility})`,
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  return { success: true };
}

export async function deleteList(projectId: string, listId: string) {
  const { supabase, user } = await requireUser();

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const role = membership?.role ?? null;
  const canDelete =
    !!profile?.is_platform_admin ||
    role === "admin" ||
    role === "member";

  if (!canDelete) {
    return { error: "Clients cannot delete lists." };
  }

  const { data: list } = await supabase
    .from("lists")
    .select("name")
    .eq("id", listId)
    .eq("project_id", projectId)
    .maybeSingle();

  const { error } = await supabase
    .from("lists")
    .delete()
    .eq("id", listId)
    .eq("project_id", projectId);

  if (error) {
    return { error: error.message };
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "list",
    entityId: listId,
    action: "deleted",
    summary: `Deleted list “${list?.name ?? "list"}”`,
  });

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function createTask(projectId: string, listId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const status = String(formData.get("status") ?? "todo") as TaskStatus;
  const assignedTo = String(formData.get("assigned_to") ?? "").trim();
  const reportedByRaw = String(formData.get("reported_by") ?? "").trim();
  const linkUrl = normalizeLinkUrl(String(formData.get("link_url") ?? ""));

  if (!title) {
    return { error: "Title is required." };
  }

  const reporter = await resolveReporterId(
    supabase,
    projectId,
    reportedByRaw,
    user.id,
  );
  if ("error" in reporter) {
    return { error: reporter.error };
  }

  const visibility = await getListVisibility(supabase, listId);
  const clientVisible = visibility === "public";

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return { error: "Project not found." };
  }

  const prefix = projectTaskPrefix(project.name);
  const { data: allocated, error: allocateError } = await supabase.rpc(
    "allocate_task_key",
    { p_project_id: projectId, p_prefix: prefix },
  );

  if (allocateError) {
    return { error: allocateError.message };
  }

  const allocation = Array.isArray(allocated) ? allocated[0] : allocated;
  if (!allocation?.task_number || !allocation?.task_key) {
    return { error: "Could not allocate a task number." };
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      list_id: listId,
      project_id: projectId,
      title,
      description: description || null,
      due_date: dueDate || null,
      status,
      link_url: linkUrl,
      number: allocation.task_number,
      key: allocation.task_key,
      created_by: user.id,
      reported_by: reporter.reportedBy,
      assigned_to: assignedTo || null,
    })
    .select("id")
    .single();

  if (error || !task) {
    return { error: error?.message ?? "Could not create task." };
  }

  const deepLink = taskDeepLink(projectId, listId, task.id);

  if (assignedTo && assignedTo !== user.id) {
    await notifyUser({
      userId: assignedTo,
      type: "task_assigned",
      title: `Assigned: ${allocation.task_key} ${title}`,
      body: "You were assigned a new task.",
      link: deepLink,
    });
  }

  if (
    reporter.reportedBy !== user.id &&
    reporter.reportedBy !== assignedTo
  ) {
    await notifyUser({
      userId: reporter.reportedBy,
      type: "task_reported",
      title: `Reported for you: ${allocation.task_key} ${title}`,
      body: "A task was logged with you as the reporter.",
      link: deepLink,
    });
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "task",
    entityId: task.id,
    action: "created",
    summary: `Created task ${allocation.task_key} “${title}”`,
    metadata: {
      list_visibility: visibility,
      reported_by: reporter.reportedBy,
      task_key: allocation.task_key,
      task_number: allocation.task_number,
      status,
    },
    clientVisible,
  });

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "task",
    entityId: task.id,
    action: "status_changed",
    summary: `Opened “${title}” as ${status.replaceAll("_", " ")}`,
    metadata: {
      from: null,
      to: status,
      list_visibility: visibility,
    },
    clientVisible,
  });

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  revalidatePath("/home");
  return { success: true };
}

export async function updateTask(
  projectId: string,
  listId: string,
  taskId: string,
  formData: FormData,
) {
  const { supabase, user } = await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const status = String(formData.get("status") ?? "todo") as TaskStatus;
  const assignedTo = String(formData.get("assigned_to") ?? "").trim();
  const reportedByRaw = String(formData.get("reported_by") ?? "").trim();
  const linkUrl = normalizeLinkUrl(String(formData.get("link_url") ?? ""));

  if (!title) {
    return { error: "Title is required." };
  }

  const reporter = await resolveReporterId(
    supabase,
    projectId,
    reportedByRaw,
    user.id,
  );
  if ("error" in reporter) {
    return { error: reporter.error };
  }

  const visibility = await getListVisibility(supabase, listId);
  const clientVisible = visibility === "public";
  const deepLink = taskDeepLink(projectId, listId, taskId);

  const { data: before } = await supabase
    .from("tasks")
    .select("title, status, assigned_to, reported_by, created_by")
    .eq("id", taskId)
    .maybeSingle();

  const { error } = await supabase
    .from("tasks")
    .update({
      title,
      description: description || null,
      due_date: dueDate || null,
      status,
      link_url: linkUrl,
      reported_by: reporter.reportedBy,
      assigned_to: assignedTo || null,
    })
    .eq("id", taskId);

  if (error) {
    return { error: error.message };
  }

  const previousAssignee = before?.assigned_to ?? null;
  const nextAssignee = assignedTo || null;

  if (nextAssignee && nextAssignee !== previousAssignee && nextAssignee !== user.id) {
    await notifyUser({
      userId: nextAssignee,
      type: "task_assigned",
      title: `Assigned: ${title}`,
      body: "A task was assigned to you.",
      link: deepLink,
    });
  }

  if (
    reporter.reportedBy !== before?.reported_by &&
    reporter.reportedBy !== user.id &&
    reporter.reportedBy !== nextAssignee
  ) {
    await notifyUser({
      userId: reporter.reportedBy,
      type: "task_reported",
      title: `Reported for you: ${title}`,
      body: "You were set as the reporter on a task.",
      link: deepLink,
    });
  }

  if (
    status === "requiring_feedback" &&
    before?.status !== "requiring_feedback"
  ) {
    const recipients = new Set<string>();
    if (before?.assigned_to) recipients.add(before.assigned_to);
    if (nextAssignee) recipients.add(nextAssignee);
    if (before?.created_by) recipients.add(before.created_by);
    if (before?.reported_by) recipients.add(before.reported_by);
    recipients.add(reporter.reportedBy);
    recipients.delete(user.id);

    for (const recipientId of recipients) {
      await notifyUser({
        userId: recipientId,
        type: "task_feedback",
        title: `Feedback requested: ${title}`,
        body: "A task was moved to Requiring feedback.",
        link: deepLink,
      });
    }
  }

  const statusChanged = before?.status !== status;

  if (statusChanged) {
    await logActivity({
      projectId,
      actorId: user.id,
      entityType: "task",
      entityId: taskId,
      action: "status_changed",
      summary: `Moved “${title}” to ${status.replaceAll("_", " ")}`,
      metadata: {
        from: before?.status ?? null,
        to: status,
        list_visibility: visibility,
      },
      clientVisible,
    });
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "task",
    entityId: taskId,
    action: "updated",
    summary: `Updated task “${title}”`,
    metadata: {
      status,
      assigned_to: nextAssignee,
      reported_by: reporter.reportedBy,
      previous_status: before?.status ?? null,
      list_visibility: visibility,
    },
    clientVisible,
  });

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  return { success: true };
}

export async function updateTaskStatus(
  projectId: string,
  listId: string,
  taskId: string,
  status: TaskStatus,
) {
  const { supabase, user } = await requireUser();
  const visibility = await getListVisibility(supabase, listId);
  const clientVisible = visibility === "public";
  const deepLink = taskDeepLink(projectId, listId, taskId);

  const { data: before } = await supabase
    .from("tasks")
    .select("title, status, assigned_to, created_by, reported_by")
    .eq("id", taskId)
    .maybeSingle();

  const { error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId);

  if (error) {
    return { error: error.message };
  }

  if (status === "requiring_feedback" && before?.status !== "requiring_feedback") {
    const recipients = new Set<string>();
    if (before?.assigned_to) recipients.add(before.assigned_to);
    if (before?.created_by) recipients.add(before.created_by);
    if (before?.reported_by) recipients.add(before.reported_by);
    recipients.delete(user.id);

    for (const recipientId of recipients) {
      await notifyUser({
        userId: recipientId,
        type: "task_feedback",
        title: `Feedback requested: ${before?.title ?? "Task"}`,
        body: "A task was moved to Requiring feedback.",
        link: deepLink,
      });
    }
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "task",
    entityId: taskId,
    action: "status_changed",
    summary: `Moved “${before?.title ?? "task"}” to ${status.replaceAll("_", " ")}`,
    metadata: {
      from: before?.status ?? null,
      to: status,
      list_visibility: visibility,
    },
    clientVisible,
  });

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  return { success: true };
}

export async function deleteTask(
  projectId: string,
  listId: string,
  taskId: string,
) {
  const { supabase, user } = await requireUser();
  const visibility = await getListVisibility(supabase, listId);
  const clientVisible = visibility === "public";

  const { data: before } = await supabase
    .from("tasks")
    .select("title")
    .eq("id", taskId)
    .maybeSingle();

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) {
    return { error: error.message };
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "task",
    entityId: taskId,
    action: "deleted",
    summary: `Deleted task “${before?.title ?? "task"}”`,
    metadata: { list_visibility: visibility },
    clientVisible,
  });

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}/lists/${listId}/archive`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  return { success: true };
}

export async function archiveEligibleTasks(opts?: {
  listId?: string;
  projectId?: string;
}) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("archive_eligible_tasks", {
    p_list_id: opts?.listId ?? null,
    p_project_id: opts?.projectId ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  if (opts?.listId && opts?.projectId) {
    revalidatePath(`/projects/${opts.projectId}/lists/${opts.listId}`);
    revalidatePath(`/projects/${opts.projectId}/lists/${opts.listId}/archive`);
  }
  if (opts?.projectId) {
    revalidatePath(`/projects/${opts.projectId}`);
  }
  revalidatePath("/tasks");
  return { success: true };
}

export async function restoreArchivedTask(
  projectId: string,
  listId: string,
  taskId: string,
) {
  const { supabase, user } = await requireUser();
  const visibility = await getListVisibility(supabase, listId);
  const clientVisible = visibility === "public";

  const { data: before } = await supabase
    .from("tasks")
    .select("title, archived_at")
    .eq("id", taskId)
    .maybeSingle();

  if (!before?.archived_at) {
    return { error: "Task is not archived." };
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      archived_at: null,
      // Reset the 30-day window so the task stays on the board
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (error) {
    return { error: error.message };
  }

  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "task",
    entityId: taskId,
    action: "restored",
    summary: `Restored “${before.title}” from archive`,
    metadata: { list_visibility: visibility },
    clientVisible,
  });

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}/lists/${listId}/archive`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  return { success: true };
}

export async function listTaskAttachments(
  projectId: string,
  listId: string,
  taskId: string,
) {
  const { supabase } = await requireUser();

  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!list) {
    return { error: "List not found.", attachments: [] as TaskAttachment[] };
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("list_id", listId)
    .maybeSingle();

  if (!task) {
    return { error: "Task not found.", attachments: [] as TaskAttachment[] };
  }

  const { data, error } = await supabase
    .from("task_attachments")
    .select(
      "id, task_id, file_path, file_name, content_type, size_bytes, uploaded_by, created_at",
    )
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: error.message, attachments: [] as TaskAttachment[] };
  }

  return { attachments: (data ?? []) as TaskAttachment[] };
}

export async function uploadTaskAttachment(
  projectId: string,
  listId: string,
  taskId: string,
  formData: FormData,
) {
  const { supabase, user } = await requireUser();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { error: "File must be 10MB or smaller." };
  }

  const safeName = file.name.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
  const path = `${projectId}/${taskId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(TASK_ATTACHMENT_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data: row, error } = await supabase
    .from("task_attachments")
    .insert({
      task_id: taskId,
      file_path: path,
      file_name: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select("id, task_id, file_path, file_name, content_type, size_bytes, uploaded_by, created_at")
    .single();

  if (error || !row) {
    await supabase.storage.from(TASK_ATTACHMENT_BUCKET).remove([path]);
    return { error: error?.message ?? "Could not save attachment." };
  }

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  return { success: true as const, attachment: row };
}

export async function deleteTaskAttachment(
  projectId: string,
  listId: string,
  attachmentId: string,
) {
  const { supabase } = await requireUser();

  const { data: attachment } = await supabase
    .from("task_attachments")
    .select("id, file_path")
    .eq("id", attachmentId)
    .maybeSingle();

  if (!attachment) {
    return { error: "Attachment not found." };
  }

  const { error } = await supabase
    .from("task_attachments")
    .delete()
    .eq("id", attachmentId);

  if (error) {
    return { error: error.message };
  }

  await supabase.storage
    .from(TASK_ATTACHMENT_BUCKET)
    .remove([attachment.file_path]);

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  return { success: true };
}

export type TaskStatusHistoryRow = {
  id: string;
  created_at: string;
  summary: string;
  from: TaskStatus | null;
  to: TaskStatus | null;
  actor: {
    full_name: string | null;
    email: string | null;
    deleted_at: string | null;
  } | null;
};

export async function listTaskStatusHistory(
  projectId: string,
  taskId: string,
): Promise<{ error?: string; events: TaskStatusHistoryRow[] }> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("activity_events")
    .select(
      "id, summary, created_at, metadata, profiles!activity_events_actor_id_fkey(full_name, email, deleted_at)",
    )
    .eq("project_id", projectId)
    .eq("entity_type", "task")
    .eq("entity_id", taskId)
    .eq("action", "status_changed")
    .order("created_at", { ascending: true });

  if (error) {
    return { error: error.message, events: [] };
  }

  const events: TaskStatusHistoryRow[] = (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const metadata =
      row.metadata &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const from =
      typeof metadata.from === "string" ? (metadata.from as TaskStatus) : null;
    const to =
      typeof metadata.to === "string" ? (metadata.to as TaskStatus) : null;

    return {
      id: row.id,
      created_at: row.created_at,
      summary: row.summary,
      from,
      to,
      actor: profile
        ? {
            full_name: (profile.full_name as string | null) ?? null,
            email: (profile.email as string | null) ?? null,
            deleted_at: (profile.deleted_at as string | null) ?? null,
          }
        : null,
    };
  });

  return { events };
}
