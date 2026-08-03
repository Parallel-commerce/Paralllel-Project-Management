"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
) {
  const { supabase, user } = await requireUser();

  if (!["admin", "member", "client"].includes(role)) {
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
