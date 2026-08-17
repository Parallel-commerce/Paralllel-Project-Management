"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/types/database";

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

function revalidateAlerts() {
  revalidatePath("/", "layout");
}

export async function listNotifications(): Promise<{
  notifications: Notification[];
  unreadCount: number;
}> {
  const { supabase, user } = await requireUser();

  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, user_id, type, title, body, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);

  return {
    notifications: (data ?? []) as Notification[],
    unreadCount: count ?? 0,
  };
}

export async function markNotificationRead(notificationId: string) {
  const { supabase, user } = await requireUser();

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidateAlerts();
  return { success: true };
}

export async function markAllNotificationsRead() {
  const { supabase, user } = await requireUser();

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidateAlerts();
  return { success: true };
}

export async function clearNotification(notificationId: string) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidateAlerts();
  return { success: true };
}

export async function clearAllNotifications() {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidateAlerts();
  return { success: true };
}
