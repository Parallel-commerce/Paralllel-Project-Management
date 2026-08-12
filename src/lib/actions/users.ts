"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendInviteMagicLink } from "@/lib/notify";
import { AVATAR_BUCKET } from "@/lib/profile-avatar";
import { createClient } from "@/lib/supabase/server";
import type { ProjectRole } from "@/types/database";

const AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const VALID_ROLES = new Set<ProjectRole>(["admin", "member", "client"]);

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

async function requirePlatformAdmin() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_platform_admin) {
    return { error: "Platform admin access required." as const };
  }

  return { supabase, user };
}

function parseProjectAllocations(formData: FormData) {
  const projectIds = formData.getAll("project_id").map((value) => String(value));
  const roles = formData.getAll("project_role").map((value) => String(value));
  const allocations: { projectId: string; role: ProjectRole }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < projectIds.length; i += 1) {
    const projectId = projectIds[i]?.trim();
    const role = (roles[i] ?? "client") as ProjectRole;
    if (!projectId) continue;
    if (!VALID_ROLES.has(role)) continue;
    if (seen.has(projectId)) continue;
    seen.add(projectId);
    allocations.push({ projectId, role });
  }

  return allocations;
}

export async function invitePlatformUser(formData: FormData) {
  const admin = await requirePlatformAdmin();
  if ("error" in admin) {
    return { error: admin.error };
  }

  const { supabase, user } = admin;
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const makePlatformAdmin =
    String(formData.get("is_platform_admin") ?? "") === "on" ||
    String(formData.get("is_platform_admin") ?? "") === "1" ||
    String(formData.get("is_platform_admin") ?? "") === "true";
  const allocations = parseProjectAllocations(formData);

  if (!email || !email.includes("@")) {
    return { error: "A valid email is required." };
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, email, is_platform_admin")
    .ilike("email", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingProfile) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        title: title || null,
        is_platform_admin: makePlatformAdmin,
      })
      .eq("id", existingProfile.id);

    if (profileError) {
      return { error: profileError.message };
    }
  }

  const invitedProjectIds: string[] = [];
  for (const allocation of allocations) {
    const { error } = await supabase.from("project_invites").insert({
      project_id: allocation.projectId,
      email,
      role: allocation.role,
      invited_by: user.id,
    });

    if (error) {
      if (error.code === "23505") {
        return {
          error: `${email} already has a pending invite for one of the selected projects.`,
        };
      }
      return { error: error.message };
    }

    invitedProjectIds.push(allocation.projectId);
  }

  const nextPath =
    invitedProjectIds.length === 1
      ? `/projects/${invitedProjectIds[0]}`
      : "/home";

  const magic = await sendInviteMagicLink(email, nextPath, {
    fullName,
    title,
  });

  // OTP may create the auth user immediately; apply name/title/admin after.
  const { data: createdOrExisting } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .is("deleted_at", null)
    .maybeSingle();

  let platformAdminPending = false;
  if (createdOrExisting) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        title: title || null,
        is_platform_admin: makePlatformAdmin,
      })
      .eq("id", createdOrExisting.id);

    if (profileError) {
      return { error: profileError.message };
    }
  } else {
    platformAdminPending = makePlatformAdmin;
  }

  for (const projectId of invitedProjectIds) {
    revalidatePath(`/projects/${projectId}`);
  }
  revalidatePath("/users");
  revalidatePath("/projects");

  if (magic.error) {
    return {
      success: true as const,
      warning:
        existingProfile || invitedProjectIds.length > 0 || createdOrExisting
          ? "User updated / invites saved, but the sign-in email failed to send."
          : "Could not send the sign-in email.",
      message: magic.error,
    };
  }

  return {
    success: true as const,
    message: createdOrExisting
      ? invitedProjectIds.length > 0
        ? "User saved, added to projects, and a sign-in email was sent."
        : "User saved and a sign-in email was sent."
      : invitedProjectIds.length > 0
        ? "Invites created and a sign-in email was sent. They’ll join the projects when they sign in."
        : "Sign-in email sent. They’ll appear here after their first login.",
    platformAdminPending,
  };
}

export async function addMemberToProject(
  projectId: string,
  userId: string,
  role: ProjectRole,
) {
  const result = await requirePlatformAdmin();
  if ("error" in result) {
    return result;
  }

  const { supabase } = result;

  if (!VALID_ROLES.has(role)) {
    return { error: "Invalid role." };
  }

  const { data: existing } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return { error: "User is already on this project." };
  }

  const { error } = await supabase.from("project_members").insert({
    project_id: projectId,
    user_id: userId,
    role,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "User is already on this project." };
    }
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/users");
  return { success: true };
}

export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
) {
  const { supabase, user } = await requireUser();

  if (!VALID_ROLES.has(role)) {
    return { error: "Invalid role." };
  }

  if (userId === user.id && role !== "admin") {
    const { count } = await supabase
      .from("project_members")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("role", "admin")
      .neq("user_id", userId);

    if ((count ?? 0) === 0) {
      return { error: "Cannot demote the last project admin." };
    }
  }

  if (role !== "admin") {
    const { data: target } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (target?.role === "admin") {
      const { count } = await supabase
        .from("project_members")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("role", "admin")
        .neq("user_id", userId);

      if ((count ?? 0) === 0) {
        return { error: "Cannot demote the last project admin." };
      }
    }
  }

  const { error } = await supabase
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/users");
  return { success: true };
}

export async function setPlatformAdmin(userId: string, enabled: boolean) {
  const result = await requirePlatformAdmin();
  if ("error" in result) {
    return result;
  }

  const { supabase, user } = result;

  if (userId === user.id && !enabled) {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_platform_admin", true)
      .neq("id", userId);

    if ((count ?? 0) === 0) {
      return { error: "Cannot demote the last platform admin." };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_platform_admin: enabled })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/users");
  return { success: true };
}

export async function updateOwnProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const removeAvatar = String(formData.get("remove_avatar") ?? "") === "1";
  const avatar = formData.get("avatar");

  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  let avatarPath = existing?.avatar_path ?? null;

  if (removeAvatar && avatarPath) {
    await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
    avatarPath = null;
  }

  if (avatar instanceof File && avatar.size > 0) {
    if (!AVATAR_MIME_TYPES.has(avatar.type)) {
      return { error: "Photo must be a JPEG, PNG, WebP, or GIF." };
    }
    if (avatar.size > AVATAR_MAX_BYTES) {
      return { error: "Photo must be 2MB or smaller." };
    }

    const extension =
      avatar.type === "image/jpeg"
        ? "jpg"
        : avatar.type === "image/png"
          ? "png"
          : avatar.type === "image/webp"
            ? "webp"
            : "gif";
    const nextPath = `${user.id}/avatar.${extension}`;

    if (avatarPath && avatarPath !== nextPath) {
      await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
    }

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(nextPath, avatar, {
        upsert: true,
        contentType: avatar.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      return { error: uploadError.message };
    }

    avatarPath = nextPath;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName || null,
      title: title || null,
      avatar_path: avatarPath,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  revalidatePath("/users");
  revalidatePath("/projects");
  return { success: true };
}

export async function updateUserProfile(
  userId: string,
  formData: FormData,
) {
  const result = await requirePlatformAdmin();
  if ("error" in result) {
    return result;
  }

  const { supabase } = result;
  const fullName = String(formData.get("full_name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName || null,
      title: title || null,
    })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/users");
  revalidatePath("/projects");
  return { success: true };
}

export async function removeMemberFromProject(
  projectId: string,
  userId: string,
) {
  const { supabase, user } = await requireUser();

  if (userId === user.id) {
    return { error: "You cannot remove yourself." };
  }

  const { data: target } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (target?.role === "admin") {
    const { count } = await supabase
      .from("project_members")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("role", "admin")
      .neq("user_id", userId);

    if ((count ?? 0) === 0) {
      return { error: "Cannot remove the last project admin." };
    }
  }

  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/users");
  return { success: true };
}

export async function deleteUser(userId: string) {
  const result = await requirePlatformAdmin();
  if ("error" in result) {
    return { error: result.error };
  }

  const { supabase, user } = result;

  if (userId === user.id) {
    return { error: "You cannot delete your own account." };
  }

  const { error } = await supabase.rpc("soft_delete_user", {
    p_user_id: userId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/users");
  revalidatePath("/projects");
  revalidatePath("/messages");
  revalidatePath("/tasks");
  return { success: true };
}

export async function reinstateUser(userId: string, email?: string) {
  const result = await requirePlatformAdmin();
  if ("error" in result) {
    return { error: result.error };
  }

  const { supabase } = result;
  const restoreEmail = email?.trim().toLowerCase() || null;

  const { error } = await supabase.rpc("reinstate_user", {
    p_user_id: userId,
    p_email: restoreEmail,
  });

  if (error) {
    return { error: error.message };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.email) {
    try {
      await sendInviteMagicLink(profile.email);
    } catch {
      // Account is reinstated even if the magic link email fails
    }
  }

  revalidatePath("/users");
  revalidatePath("/projects");
  return { success: true, email: profile?.email ?? restoreEmail };
}
