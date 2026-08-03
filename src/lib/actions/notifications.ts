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

export async function listNotifications(): Promise<{
  notifications: Notification[];
  unreadCount: number;
}> {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("notifications")
    .select("id, user_id, type, title, body, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const notifications = (data ?? []) as Notification[];
  const unreadCount = notifications.filter((n) => !n.read_at).length;
  return { notifications, unreadCount };
}

export async function markNotificationRead(notificationId: string) {
  const { supabase, user } = await requireUser();

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  revalidatePath("/projects");
  return { success: true };
}

export async function markAllNotificationsRead() {
  const { supabase, user } = await requireUser();

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidatePath("/projects");
  return { success: true };
}
