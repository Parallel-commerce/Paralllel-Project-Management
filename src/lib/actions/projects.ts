"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  removeMemberFromProject,
  updateMemberRole as updateMemberRoleAction,
} from "@/lib/actions/users";
import {
  allocateNextAvailableDay,
  dayIsOccupied,
  hasActiveCadence,
  type ScheduleConfig,
} from "@/lib/allocate-due-dates";
import {
  compareTodoPriority,
  planTodoDueDates,
  type TodoScheduleUpdate,
} from "@/lib/schedule-todos";
import { logActivity, notifyUser, sendSignInCode } from "@/lib/notify";
import { PROJECT_LOGO_BUCKET } from "@/lib/project-logo";
import { projectReportPath } from "@/lib/report-paths";
import { parseProjectEngagement } from "@/lib/project-type";
import { parseScheduledWeekdays } from "@/lib/scheduled-weekdays";
import { parseImportance } from "@/lib/task-importance";
import { projectTaskPrefix } from "@/lib/task-key";
import {
  parseTaskType,
  taskTypeOmitsDueDate,
  taskTypePrefersFirstAvailable,
} from "@/lib/task-type";
import { TASK_ATTACHMENT_BUCKET } from "@/lib/task-attachments";
import { fetchThemeCommit } from "@/lib/github/theme";
import {
  emptyThemeCommitSnapshot,
  hasThemeDeployChoice,
  noneThemeCommitSnapshot,
  snapshotFromCommit,
  THEME_COMMIT_NONE,
  THEME_DEPLOY_REQUIRED_MESSAGE,
  type ThemeCommitSnapshot,
} from "@/lib/theme-deploy";
import type {
  ListVisibility,
  ProjectRole,
  ProjectType,
  ScheduleCadence,
  TaskAttachment,
  TaskStatus,
  TaskType,
} from "@/types/database";

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

/** Prefer the creating admin, otherwise the earliest project admin. */
async function resolveDefaultAssignee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  currentUserId: string,
) {
  const { data: currentMembership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", currentUserId)
    .maybeSingle();

  if (currentMembership?.role === "admin") {
    return currentUserId;
  }

  const { data: admins } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1);

  return (admins?.[0]?.user_id as string | undefined) ?? null;
}

async function resolveTaskSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  sourceReportId: string,
  sourceActionKey: string,
): Promise<
  | { sourceReportId: string | null; sourceActionKey: string | null }
  | { error: string }
> {
  if (!sourceReportId && !sourceActionKey) {
    return { sourceReportId: null, sourceActionKey: null };
  }
  if (!sourceReportId || !sourceActionKey) {
    return { error: "Report actions need both a report and an action key." };
  }
  if (!/^[0-9a-f]{8,16}$/.test(sourceActionKey)) {
    return { error: "Invalid report action." };
  }

  const { data: report } = await supabase
    .from("project_reports")
    .select("id")
    .eq("id", sourceReportId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!report) {
    return { error: "Report not found." };
  }

  return { sourceReportId, sourceActionKey };
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

const THEME_COMMIT_SELECT =
  "theme_commit_sha, theme_commit_message, theme_commit_url, theme_committed_at, theme_commit_none";

function snapshotFromRow(row: {
  theme_commit_sha?: string | null;
  theme_commit_message?: string | null;
  theme_commit_url?: string | null;
  theme_committed_at?: string | null;
  theme_commit_none?: boolean | null;
}): ThemeCommitSnapshot {
  return {
    theme_commit_sha: row.theme_commit_sha ?? null,
    theme_commit_message: row.theme_commit_message ?? null,
    theme_commit_url: row.theme_commit_url ?? null,
    theme_committed_at: row.theme_committed_at ?? null,
    theme_commit_none: Boolean(row.theme_commit_none),
  };
}

async function projectHasThemeGit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const { data } = await supabase
    .from("project_theme_git")
    .select("repo, branch")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data?.repo) return null;
  return { repo: data.repo, branch: data.branch || "main" };
}

async function resolveThemeCommitChoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  raw: string,
): Promise<ThemeCommitSnapshot | { error: string } | { unset: true }> {
  const value = raw.trim();
  if (!value) return { unset: true };
  if (value === THEME_COMMIT_NONE) return noneThemeCommitSnapshot();

  const git = await projectHasThemeGit(supabase, projectId);
  if (!git) {
    return { error: "This project has no theme GitHub repo connected." };
  }

  const commit = await fetchThemeCommit(git, value);
  if ("error" in commit) return commit;
  return snapshotFromCommit(commit);
}

async function themeFieldsForWrite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  status: TaskStatus,
  previousStatus: TaskStatus | null,
  rawChoice: string,
  existing: ThemeCommitSnapshot,
): Promise<ThemeCommitSnapshot | { error: string }> {
  const git = await projectHasThemeGit(supabase, projectId);
  const resolved = await resolveThemeCommitChoice(
    supabase,
    projectId,
    rawChoice,
  );
  if ("error" in resolved) return resolved;

  const next = "unset" in resolved ? existing : resolved;
  const transitioningToDone = status === "done" && previousStatus !== "done";

  if (git && transitioningToDone && !hasThemeDeployChoice(next)) {
    return { error: THEME_DEPLOY_REQUIRED_MESSAGE };
  }

  return next;
}

async function saveProjectEngagement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  input: {
    projectType: ProjectType | null;
    scheduleCadence: import("@/types/database").ScheduleCadence;
    scheduleAnchorDate: string;
  },
) {
  const { error } = await supabase.from("project_engagement").upsert(
    {
      project_id: projectId,
      project_type: input.projectType,
      schedule_cadence: input.scheduleCadence,
      schedule_anchor_date: input.scheduleAnchorDate,
    },
    { onConflict: "project_id" },
  );
  return error;
}

export async function createProject(
  formData: FormData,
): Promise<{ error: string } | void> {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const scheduledWeekdays = parseScheduledWeekdays(formData);
  const engagement = parseProjectEngagement(formData);

  if (!name) {
    return { error: "Project name is required." };
  }
  if ("error" in engagement) {
    return { error: engagement.error };
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
      scheduled_weekdays: scheduledWeekdays,
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

  const engagementError = await saveProjectEngagement(supabase, data.id, engagement);
  if (engagementError) {
    return {
      error: `Project created but engagement details could not be saved: ${engagementError.message}`,
    };
  }

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function reorderProjects(orderedIds: string[]) {
  const { supabase } = await requireUser();

  if (orderedIds.length === 0) {
    return { success: true as const };
  }

  const { error } = await supabase.rpc("reorder_projects", {
    p_ordered_ids: orderedIds,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/projects");
  return { success: true as const };
}

export async function updateProject(projectId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const scheduledWeekdays = parseScheduledWeekdays(formData);
  const engagement = parseProjectEngagement(formData);
  const removeLogo = String(formData.get("remove_logo") ?? "") === "1";
  const logo = formData.get("logo");

  if (!name) {
    return { error: "Project name is required." };
  }
  if ("error" in engagement) {
    return { error: engagement.error };
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
      scheduled_weekdays: scheduledWeekdays,
    })
    .eq("id", projectId);

  if (error) {
    return { error: error.message };
  }

  const engagementError = await saveProjectEngagement(
    supabase,
    projectId,
    engagement,
  );
  if (engagementError) {
    return { error: engagementError.message };
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
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath("/home");
  revalidatePath("/tasks");
  revalidatePath("/crm");
  return { success: true };
}

async function deleteProjectRecord(
  projectId: string,
  options: {
    confirmationName?: string;
    redirectToProjects?: boolean;
  } = {},
): Promise<{ error: string } | void> {
  const { supabase, user } = await requireUser();
  const typedName = options.confirmationName?.trim() ?? "";

  const [{ data: membership }, { data: profile }, { data: project }] =
    await Promise.all([
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
      supabase
        .from("projects")
        .select("name, logo_path, company_id")
        .eq("id", projectId)
        .maybeSingle(),
    ]);

  if (!project) {
    return { error: "Project not found." };
  }

  const canDelete =
    !!profile?.is_platform_admin || membership?.role === "admin";
  if (!canDelete) {
    return { error: "Only admins can delete projects." };
  }

  if (
    options.confirmationName !== undefined &&
    (!typedName || typedName !== project.name)
  ) {
    return { error: "Type the project name exactly to confirm deletion." };
  }

  const { data: taskRows } = await supabase
    .from("tasks")
    .select("id")
    .eq("project_id", projectId);
  const taskIds = (taskRows ?? []).map((row) => row.id);
  const attachmentPaths: string[] = [];
  if (taskIds.length > 0) {
    const { data: attachments } = await supabase
      .from("task_attachments")
      .select("file_path")
      .in("task_id", taskIds);
    for (const row of attachments ?? []) {
      attachmentPaths.push(row.file_path);
    }

    const { data: comments } = await supabase
      .from("task_comments")
      .select("id")
      .in("task_id", taskIds);
    const commentIds = (comments ?? []).map((row) => row.id);
    if (commentIds.length > 0) {
      const { data: commentAttachments } = await supabase
        .from("task_comment_attachments")
        .select("file_path")
        .in("comment_id", commentIds);
      for (const row of commentAttachments ?? []) {
        attachmentPaths.push(row.file_path);
      }
    }
  }

  if (project.logo_path) {
    await supabase.storage.from(PROJECT_LOGO_BUCKET).remove([project.logo_path]);
  }
  if (attachmentPaths.length > 0) {
    await supabase.storage.from(TASK_ATTACHMENT_BUCKET).remove(attachmentPaths);
  }

  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/home");
  revalidatePath("/tasks");
  revalidatePath("/messages");
  revalidatePath("/crm");
  if (project.company_id) {
    revalidatePath(`/crm/${project.company_id}`);
  }
  if (options.redirectToProjects) {
    redirect("/projects");
  }
}

export async function deleteProject(
  projectId: string,
  confirmationName: string,
): Promise<{ error: string } | void> {
  return deleteProjectRecord(projectId, {
    confirmationName,
    redirectToProjects: true,
  });
}

export async function deleteProjectInPlace(
  projectId: string,
): Promise<{ error: string } | void> {
  return deleteProjectRecord(projectId);
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

  const otp = await sendSignInCode(email);
  if (otp.error) {
    // Membership/invite still saved; surface soft warning
    console.error(otp.error);
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
    message: otp.error
      ? "Person added, but the sign-in email failed to send."
      : "Person added and a sign-in code was emailed.",
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

/** Open (not done/archived) tasks already due on each day for this project. */
export async function getProjectDueDateCounts(
  projectId: string,
  excludeTaskId?: string | null,
): Promise<{ counts: Record<string, number> }> {
  const { supabase } = await requireUser();
  if (!projectId) return { counts: {} };

  const { data, error } = await supabase
    .from("tasks")
    .select("id, due_date")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .neq("status", "done")
    .not("due_date", "is", null);

  if (error || !data) return { counts: {} };

  const counts: Record<string, number> = {};
  for (const row of data) {
    if (excludeTaskId && row.id === excludeTaskId) continue;
    const day =
      typeof row.due_date === "string" ? row.due_date.slice(0, 10) : "";
    if (!day) continue;
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return { counts };
}

async function loadDueDateOccupancy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  excludeTaskId?: string | null,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("tasks")
    .select("id, due_date")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .neq("status", "done")
    .not("due_date", "is", null);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (excludeTaskId && row.id === excludeTaskId) continue;
    const day =
      typeof row.due_date === "string" ? row.due_date.slice(0, 10) : "";
    if (!day) continue;
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts;
}

async function loadProjectSchedule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<ScheduleConfig> {
  const { data } = await supabase.rpc("project_schedule_config", {
    p_project_id: projectId,
  });

  const row = Array.isArray(data) ? data[0] : data;
  const weekdays = Array.isArray(row?.scheduled_weekdays)
    ? (row.scheduled_weekdays as number[])
    : [];

  return {
    weekdays,
    cadence: (row?.schedule_cadence as ScheduleCadence) ?? "weekly",
    anchorDate:
      typeof row?.schedule_anchor_date === "string"
        ? row.schedule_anchor_date.slice(0, 10)
        : new Date().toISOString().slice(0, 10),
  };
}

/**
 * Rewrite to-do due dates from priority order.
 * Admin-locked dates stay on their day and block that day for everyone else.
 */
async function rescheduleListTodos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  listId: string,
  options?: {
    orderedTodoIds?: string[];
    updateImportance?: boolean;
  },
): Promise<{ updates: TodoScheduleUpdate[] } | { error: string }> {
  const { data: rows, error: loadError } = await supabase
    .from("tasks")
    .select(
      "id, status, due_date, due_date_locked, task_type, importance, created_at",
    )
    .eq("project_id", projectId)
    .eq("list_id", listId)
    .is("archived_at", null);

  if (loadError) return { error: loadError.message };

  const tasks = (rows ?? []).map((row) => ({
    id: row.id as string,
    status: row.status as string,
    due_date: (row.due_date as string | null) ?? null,
    due_date_locked: !!row.due_date_locked,
    task_type: (row.task_type as TaskType | null) ?? null,
    importance: (row.importance as number | null) ?? 0,
    created_at: (row.created_at as string | null) ?? null,
  }));

  const todos = tasks.filter((row) => row.status === "todo");
  const orderedTodoIds =
    options?.orderedTodoIds ??
    [...todos].sort(compareTodoPriority).map((row) => row.id);

  const schedule = await loadProjectSchedule(supabase, projectId);
  const updates = planTodoDueDates({
    orderedTodoIds,
    tasks,
    schedule,
  });
  const byId = new Map(tasks.map((row) => [row.id, row]));
  const updateImportance = options?.updateImportance ?? false;

  for (const update of updates) {
    const existing = byId.get(update.id);
    const previousDay = existing?.due_date?.slice(0, 10) ?? null;
    const sameDate = previousDay === update.due_date;
    const sameLock = !!existing?.due_date_locked === update.due_date_locked;
    const sameImportance = (existing?.importance ?? 0) === update.importance;
    if (sameDate && sameLock && (!updateImportance || sameImportance)) {
      continue;
    }

    const payload: {
      due_date: string | null;
      due_date_locked: boolean;
      importance?: number;
    } = {
      due_date: update.due_date,
      due_date_locked: update.due_date_locked,
    };
    if (updateImportance) payload.importance = update.importance;

    const { error } = await supabase
      .from("tasks")
      .update(payload)
      .eq("id", update.id)
      .eq("project_id", projectId)
      .eq("list_id", listId);

    if (error) return { error: error.message };
  }

  return { updates };
}

async function getProjectAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  userId: string,
): Promise<{
  role: ProjectRole;
  isPlatformAdmin: boolean;
  isAdmin: boolean;
  isInternal: boolean;
  isClient: boolean;
}> {
  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const role = (membership?.role ?? "client") as ProjectRole;
  const isPlatformAdmin = !!profile?.is_platform_admin;
  const isAdmin = role === "admin" || isPlatformAdmin;
  const isInternal = isPlatformAdmin || role === "admin" || role === "member";
  return {
    role,
    isPlatformAdmin,
    isAdmin,
    isInternal,
    isClient: !isInternal,
  };
}

async function assertClientChangeQuota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  isClient: boolean,
): Promise<{ error: string } | null> {
  if (!isClient) return null;

  const { data: limit, error: limitError } = await supabase.rpc(
    "project_monthly_change_limit",
    { p_project_id: projectId },
  );

  if (limitError) {
    return { error: limitError.message };
  }

  if (limit === null || limit === undefined) return null;

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const { count, error } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .is("archived_at", null)
    .gte("created_at", monthStart);

  if (error) {
    return { error: error.message };
  }

  const numericLimit = Number(limit);
  if ((count ?? 0) >= numericLimit) {
    if (numericLimit === 0) {
      return {
        error:
          "This Maintain plan does not include change requests. Ask Parallel to log billable work for you.",
      };
    }
    return {
      error: `This plan includes ${numericLimit} change${numericLimit === 1 ? "" : "s"} per month, and that allowance has been used. Ask Parallel if you need another change.`,
    };
  }

  return null;
}

async function resolveTaskDueDate(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  projectId: string;
  requestedDueDate: string;
  isAdmin: boolean;
  excludeTaskId?: string | null;
  /** When true, empty requested date auto-allocates. */
  autoAllocate: boolean;
  taskType?: TaskType | null;
}): Promise<{ dueDate: string | null } | { error: string }> {
  const {
    supabase,
    projectId,
    requestedDueDate,
    isAdmin,
    excludeTaskId,
    autoAllocate,
    taskType,
  } = options;

  if (taskTypeOmitsDueDate(taskType)) {
    return { dueDate: null };
  }

  // Only admins may pick a specific day; everyone else is auto-scheduled.
  const effectiveRequested = isAdmin ? requestedDueDate : "";

  const occupancy = await loadDueDateOccupancy(
    supabase,
    projectId,
    excludeTaskId,
  );
  const schedule = await loadProjectSchedule(supabase, projectId);
  const shouldAutoAllocate =
    autoAllocate || taskTypePrefersFirstAvailable(taskType);

  if (!effectiveRequested) {
    if (!shouldAutoAllocate || !hasActiveCadence(schedule.cadence)) {
      return { dueDate: null };
    }
    const allocated = allocateNextAvailableDay(schedule, occupancy);
    if (!allocated) {
      return {
        error:
          "Could not find an available work day to schedule this task. Ask an admin to set a due date.",
      };
    }
    return { dueDate: allocated };
  }

  if (!isAdmin && dayIsOccupied(effectiveRequested, occupancy)) {
    return {
      error:
        "That day already has an open task. Only an admin can schedule more than one task on the same day.",
    };
  }

  return { dueDate: effectiveRequested };
}

export async function createTask(projectId: string, listId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dueDateRaw = String(formData.get("due_date") ?? "").trim();
  const status = String(formData.get("status") ?? "todo") as TaskStatus;
  const taskTypeRaw = String(formData.get("task_type") ?? "").trim();
  const assignedToRaw = String(formData.get("assigned_to") ?? "").trim();
  const reportedByRaw = String(formData.get("reported_by") ?? "").trim();
  const sourceReportId = String(formData.get("source_report_id") ?? "").trim();
  const sourceActionKey = String(formData.get("source_action_key") ?? "").trim();
  const taskType = parseTaskType(taskTypeRaw);
  const importanceResult = parseImportance(
    String(formData.get("importance") ?? ""),
  );

  if (!title) {
    return { error: "Title is required." };
  }

  if (taskTypeRaw && !taskType) {
    return { error: "Invalid task type." };
  }

  if (typeof importanceResult === "object" && "error" in importanceResult) {
    return { error: importanceResult.error };
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  const quotaError = await assertClientChangeQuota(
    supabase,
    projectId,
    access.isClient,
  );
  if (quotaError) {
    return quotaError;
  }

  const dueResolved = await resolveTaskDueDate({
    supabase,
    projectId,
    requestedDueDate: dueDateRaw,
    isAdmin: access.isAdmin,
    autoAllocate: true,
    taskType,
  });
  if ("error" in dueResolved) {
    return { error: dueResolved.error };
  }

  const source = await resolveTaskSource(
    supabase,
    projectId,
    sourceReportId,
    sourceActionKey,
  );
  if ("error" in source) {
    return { error: source.error };
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

  const assignedTo =
    assignedToRaw ||
    (await resolveDefaultAssignee(supabase, projectId, user.id)) ||
    "";

  const themeFields = await themeFieldsForWrite(
    supabase,
    projectId,
    status,
    null,
    String(formData.get("theme_commit") ?? ""),
    emptyThemeCommitSnapshot(),
  );
  if ("error" in themeFields) {
    return { error: themeFields.error };
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
      due_date: dueResolved.dueDate,
      due_date_locked:
        access.isAdmin &&
        !!dueDateRaw &&
        !!dueResolved.dueDate &&
        !taskTypeOmitsDueDate(taskType),
      status,
      task_type: taskType,
      importance: importanceResult,
      number: allocation.task_number,
      key: allocation.task_key,
      created_by: user.id,
      reported_by: reporter.reportedBy,
      assigned_to: assignedTo || null,
      source_report_id: source.sourceReportId,
      source_action_key: source.sourceActionKey,
      ...themeFields,
    })
    .select("id, key")
    .single();

  if (error?.code === "23505" && source.sourceReportId && source.sourceActionKey) {
    const { data: existing } = await supabase
      .from("tasks")
      .select("id, key")
      .eq("project_id", projectId)
      .eq("source_report_id", source.sourceReportId)
      .eq("source_action_key", source.sourceActionKey)
      .maybeSingle();
    if (existing?.id) {
      return {
        success: true,
        id: existing.id as string,
        key: (existing.key as string | null) ?? undefined,
        existing: true,
      };
    }
  }

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
      task_type: taskType,
      importance: importanceResult,
      due_date: dueResolved.dueDate,
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

  if (!taskTypeOmitsDueDate(taskType)) {
    const rescheduled = await rescheduleListTodos(supabase, projectId, listId);
    if ("error" in rescheduled) {
      return { error: rescheduled.error };
    }
  }

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  revalidatePath("/home");
  if (source.sourceReportId) {
    revalidatePath(projectReportPath(projectId, source.sourceReportId));
  }
  return {
    success: true,
    id: task.id as string,
    key: (task.key as string | null) ?? undefined,
  };
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
  const dueDateRaw = String(formData.get("due_date") ?? "").trim();
  const status = String(formData.get("status") ?? "todo") as TaskStatus;
  const taskTypeRaw = String(formData.get("task_type") ?? "").trim();
  const assignedTo = String(formData.get("assigned_to") ?? "").trim();
  const reportedByRaw = String(formData.get("reported_by") ?? "").trim();
  const taskType = parseTaskType(taskTypeRaw);
  const importanceResult = parseImportance(
    String(formData.get("importance") ?? ""),
  );

  if (!title) {
    return { error: "Title is required." };
  }

  if (taskTypeRaw && !taskType) {
    return { error: "Invalid task type." };
  }

  if (typeof importanceResult === "object" && "error" in importanceResult) {
    return { error: importanceResult.error };
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

  const access = await getProjectAccess(supabase, projectId, user.id);

  const { data: before } = await supabase
    .from("tasks")
    .select(
      `title, description, due_date, due_date_locked, status, task_type, importance, assigned_to, reported_by, created_by, ${THEME_COMMIT_SELECT}`,
    )
    .eq("id", taskId)
    .maybeSingle();

  if (!before) {
    return { error: "Task not found." };
  }

  const previousDueDate = before.due_date?.slice(0, 10) ?? null;
  const previousLocked = !!before.due_date_locked;
  let nextDueDate: string | null;
  let nextDueDateLocked: boolean;

  if (taskTypeOmitsDueDate(taskType)) {
    nextDueDate = null;
    nextDueDateLocked = false;
  } else if (!access.isAdmin) {
    nextDueDate = previousDueDate;
    nextDueDateLocked = previousLocked;
  } else if (!dueDateRaw) {
    // Cleared: drop the pin and let priority fill the date in.
    nextDueDate = null;
    nextDueDateLocked = false;
  } else if (dueDateRaw.slice(0, 10) !== previousDueDate) {
    const dueResolved = await resolveTaskDueDate({
      supabase,
      projectId,
      requestedDueDate: dueDateRaw,
      isAdmin: true,
      excludeTaskId: taskId,
      autoAllocate: false,
      taskType,
    });
    if ("error" in dueResolved) {
      return { error: dueResolved.error };
    }
    nextDueDate = dueResolved.dueDate;
    nextDueDateLocked = !!nextDueDate;
  } else {
    // The form echoed the current date. Don't treat that as a new pin.
    nextDueDate = previousDueDate;
    nextDueDateLocked = previousLocked;
  }

  const visibility = await getListVisibility(supabase, listId);
  const clientVisible = visibility === "public";
  const deepLink = taskDeepLink(projectId, listId, taskId);

  const nextDescription = description || null;
  const nextAssignee = assignedTo || null;
  const nextImportance = access.isAdmin
    ? importanceResult
    : (before.importance ?? 0);
  const themeFields = await themeFieldsForWrite(
    supabase,
    projectId,
    status,
    before?.status ?? null,
    String(formData.get("theme_commit") ?? ""),
    snapshotFromRow(before ?? {}),
  );
  if ("error" in themeFields) {
    return { error: themeFields.error };
  }

  const unchanged =
    before &&
    before.title === title &&
    (before.description ?? null) === nextDescription &&
    previousDueDate === nextDueDate &&
    previousLocked === nextDueDateLocked &&
    before.status === status &&
    (before.task_type ?? null) === taskType &&
    (before.importance ?? 0) === nextImportance &&
    (before.assigned_to ?? null) === nextAssignee &&
    before.reported_by === reporter.reportedBy &&
    (before.theme_commit_sha ?? null) === themeFields.theme_commit_sha &&
    Boolean(before.theme_commit_none) === themeFields.theme_commit_none;

  if (unchanged) {
    return { success: true, unchanged: true as const };
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      title,
      description: nextDescription,
      due_date: nextDueDate,
      due_date_locked: nextDueDateLocked,
      status,
      task_type: taskType,
      importance: nextImportance,
      reported_by: reporter.reportedBy,
      assigned_to: nextAssignee,
      ...themeFields,
    })
    .eq("id", taskId);

  if (error) {
    return { error: error.message };
  }

  const previousAssignee = before?.assigned_to ?? null;

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
        theme_commit_sha: themeFields.theme_commit_sha,
        theme_commit_none: themeFields.theme_commit_none,
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
      task_type: taskType,
      importance: nextImportance,
      assigned_to: nextAssignee,
      reported_by: reporter.reportedBy,
      previous_status: before?.status ?? null,
      list_visibility: visibility,
      theme_commit_sha: themeFields.theme_commit_sha,
      theme_commit_none: themeFields.theme_commit_none,
    },
    clientVisible,
  });

  const scheduleChanged =
    previousDueDate !== nextDueDate ||
    previousLocked !== nextDueDateLocked ||
    before.status !== status ||
    (before.task_type ?? null) !== taskType ||
    (before.importance ?? 0) !== nextImportance;

  if (scheduleChanged) {
    const rescheduled = await rescheduleListTodos(supabase, projectId, listId);
    if ("error" in rescheduled) {
      return { error: rescheduled.error };
    }
  }

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
  themeCommit?: string | null,
) {
  const { supabase, user } = await requireUser();
  const visibility = await getListVisibility(supabase, listId);
  const clientVisible = visibility === "public";
  const deepLink = taskDeepLink(projectId, listId, taskId);

  const { data: before } = await supabase
    .from("tasks")
    .select(
      `title, status, assigned_to, created_by, reported_by, ${THEME_COMMIT_SELECT}`,
    )
    .eq("id", taskId)
    .maybeSingle();

  const themeFields = await themeFieldsForWrite(
    supabase,
    projectId,
    status,
    before?.status ?? null,
    themeCommit ?? "",
    snapshotFromRow(before ?? {}),
  );
  if ("error" in themeFields) {
    return { error: themeFields.error };
  }

  const { error } = await supabase
    .from("tasks")
    .update({ status, ...themeFields })
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
      theme_commit_sha: themeFields.theme_commit_sha,
      theme_commit_none: themeFields.theme_commit_none,
    },
    clientVisible,
  });

  if (before?.status !== status) {
    const rescheduled = await rescheduleListTodos(supabase, projectId, listId);
    if ("error" in rescheduled) {
      return { error: rescheduled.error };
    }
  }

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  revalidatePath("/home");
  return { success: true, theme: themeFields };
}

function normalizeDueDate(
  value: string | null,
): string | null | { error: string } {
  if (value == null) return null;
  const day = value.trim().slice(0, 10);
  if (!day) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { error: "Enter a valid due date." };
  }
  const [year, month, date] = day.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== date
  ) {
    return { error: "Enter a valid due date." };
  }
  return day;
}

function formatDueLabel(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, date));
}

export async function updateTaskDueDate(
  projectId: string,
  listId: string,
  taskId: string,
  dueDate: string | null,
) {
  const { supabase, user } = await requireUser();
  const nextDueDate = normalizeDueDate(dueDate);
  if (nextDueDate && typeof nextDueDate !== "string") {
    return nextDueDate;
  }

  const visibility = await getListVisibility(supabase, listId);
  const clientVisible = visibility === "public";

  const { data: before } = await supabase
    .from("tasks")
    .select("title, due_date, due_date_locked, task_type")
    .eq("id", taskId)
    .maybeSingle();

  if (!before) {
    return { error: "Task not found." };
  }

  const taskType = (before.task_type as TaskType | null) ?? null;
  if (taskTypeOmitsDueDate(taskType)) {
    if (!nextDueDate) {
      return { success: true, dueDate: null };
    }
    return {
      error: "Questions are not scheduled and cannot have a due date.",
    };
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!access.isAdmin) {
    return { error: "Only an admin can change due dates." };
  }

  const previous = before.due_date?.slice(0, 10) ?? null;
  const alreadyLocked = !!before.due_date_locked;
  if (previous === nextDueDate && alreadyLocked === !!nextDueDate) {
    return { success: true, dueDate: nextDueDate };
  }

  if (nextDueDate) {
    const dueResolved = await resolveTaskDueDate({
      supabase,
      projectId,
      requestedDueDate: nextDueDate,
      isAdmin: true,
      excludeTaskId: taskId,
      autoAllocate: false,
      taskType,
    });
    if ("error" in dueResolved) {
      return { error: dueResolved.error };
    }
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      due_date: nextDueDate,
      due_date_locked: !!nextDueDate,
    })
    .eq("id", taskId);

  if (error) {
    return { error: error.message };
  }

  const rescheduled = await rescheduleListTodos(supabase, projectId, listId);
  if ("error" in rescheduled) {
    return { error: rescheduled.error };
  }

  const resulting =
    rescheduled.updates.find((update) => update.id === taskId)?.due_date ??
    nextDueDate;

  const summary = nextDueDate
    ? `Set the due date on “${before.title}” to ${formatDueLabel(nextDueDate)}`
    : resulting
      ? `Returned “${before.title}” to the priority schedule (${formatDueLabel(resulting)})`
      : `Cleared the due date on “${before.title}”`;

  if (previous !== resulting || !!nextDueDate) {
    await logActivity({
      projectId,
      actorId: user.id,
      entityType: "task",
      entityId: taskId,
      action: "updated",
      summary,
      metadata: {
        from: previous,
        to: resulting,
        due_date_locked: !!nextDueDate,
        list_visibility: visibility,
      },
      clientVisible,
    });
  }

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  revalidatePath("/home");
  return { success: true, dueDate: resulting };
}

/**
 * Reorder todo tasks by drag order, then reschedule unlocked to-dos onto the
 * next free work day. Dates an admin set stay put and still occupy that day.
 */
export async function reorderAndRescheduleTodos(
  projectId: string,
  listId: string,
  orderedTaskIds: string[],
): Promise<
  | {
      success: true;
      updates: TodoScheduleUpdate[];
    }
  | { error: string }
> {
  const { supabase, user } = await requireUser();

  if (orderedTaskIds.length === 0) {
    return { error: "No tasks to reorder." };
  }
  if (new Set(orderedTaskIds).size !== orderedTaskIds.length) {
    return { error: "Duplicate tasks in reorder." };
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!access.isAdmin) {
    return { error: "Only an admin can reorder and reschedule to-dos." };
  }

  const { data: rows, error: loadError } = await supabase
    .from("tasks")
    .select("id, status, due_date, archived_at, task_type")
    .eq("project_id", projectId)
    .eq("list_id", listId)
    .is("archived_at", null);

  if (loadError) {
    return { error: loadError.message };
  }

  const byId = new Map((rows ?? []).map((row) => [row.id as string, row]));
  for (const id of orderedTaskIds) {
    const row = byId.get(id);
    if (!row) {
      return { error: "A task in the order was not found on this list." };
    }
    if (row.status !== "todo") {
      return { error: "Only To do tasks can be reordered this way." };
    }
  }

  const orderedSet = new Set(orderedTaskIds);
  const missingTodos = (rows ?? []).filter(
    (row) => row.status === "todo" && !orderedSet.has(row.id as string),
  );
  if (missingTodos.length > 0) {
    return {
      error:
        "Reorder must include every To do task on this list. Clear filters and try again.",
    };
  }

  const rescheduled = await rescheduleListTodos(supabase, projectId, listId, {
    orderedTodoIds: orderedTaskIds,
    updateImportance: true,
  });
  if ("error" in rescheduled) {
    return { error: rescheduled.error };
  }
  const updates = rescheduled.updates;

  const visibility = await getListVisibility(supabase, listId);
  await logActivity({
    projectId,
    actorId: user.id,
    entityType: "list",
    entityId: listId,
    action: "updated",
    summary: `Reordered and rescheduled ${updates.length} to-do task${updates.length === 1 ? "" : "s"}`,
    metadata: {
      task_ids: orderedTaskIds,
      list_visibility: visibility,
    },
    clientVisible: visibility === "public",
  });

  revalidatePath(`/projects/${projectId}/lists/${listId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  revalidatePath("/home");
  return { success: true, updates };
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

  const { data: comments } = await supabase
    .from("task_comments")
    .select("id")
    .eq("task_id", taskId);
  const commentIds = (comments ?? []).map((row) => row.id);
  const commentAttachmentPaths: string[] = [];
  if (commentIds.length > 0) {
    const { data: commentAttachments } = await supabase
      .from("task_comment_attachments")
      .select("file_path")
      .in("comment_id", commentIds);
    for (const row of commentAttachments ?? []) {
      commentAttachmentPaths.push(row.file_path);
    }
  }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) {
    return { error: error.message };
  }

  if (commentAttachmentPaths.length > 0) {
    await supabase.storage
      .from(TASK_ATTACHMENT_BUCKET)
      .remove(commentAttachmentPaths);
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

  const rescheduled = await rescheduleListTodos(supabase, projectId, listId);
  if ("error" in rescheduled) {
    return { error: rescheduled.error };
  }

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

  const rescheduled = await rescheduleListTodos(supabase, projectId, listId);
  if ("error" in rescheduled) {
    return { error: rescheduled.error };
  }

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
