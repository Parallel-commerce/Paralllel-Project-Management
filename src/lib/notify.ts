import { Resend } from "resend";

import { createClient } from "@/lib/supabase/server";

type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  email?: string | null;
};

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.VERCEL_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

async function sendEmail(to: string, subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL || "Parallel <onboarding@resend.dev>";

  if (!apiKey) {
    return { skipped: true as const };
  }

  const resend = new Resend(apiKey);
  const absoluteLinkHint = text.includes("http")
    ? text
    : `${text}\n\nOpen Parallel: ${appUrl()}`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    text: absoluteLinkHint,
  });

  if (error) {
    console.error("Resend error:", error);
    return { error: error.message };
  }

  return { sent: true as const };
}

export async function sendPlainEmail(to: string, subject: string, text: string) {
  return sendEmail(to, subject, text);
}

export async function notifyUser(input: NotifyInput) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("create_notification", {
    p_user_id: input.userId,
    p_type: input.type,
    p_title: input.title,
    p_body: input.body ?? null,
    p_link: input.link ?? null,
  });

  if (error) {
    console.error("create_notification failed:", error.message);
  }

  let email = input.email;
  if (!email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", input.userId)
      .maybeSingle();
    email = profile?.email;
  }

  if (email) {
    const linkLine = input.link
      ? `\n\nView: ${appUrl()}${input.link.startsWith("/") ? input.link : `/${input.link}`}`
      : "";
    await sendEmail(
      email,
      input.title,
      `${input.body ?? input.title}${linkLine}`,
    );
  }
}

export async function logActivity(input: {
  projectId: string;
  actorId: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  metadata?: Record<string, unknown>;
  clientVisible?: boolean;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_activity", {
    p_project_id: input.projectId,
    p_actor_id: input.actorId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? null,
    p_action: input.action,
    p_summary: input.summary,
    p_metadata: input.metadata ?? {},
    p_client_visible: input.clientVisible ?? false,
  });

  if (error) {
    console.error("log_activity failed:", error.message);
  }
}

export async function sendInviteMagicLink(
  email: string,
  nextPath = "/home",
  profile?: { fullName?: string; title?: string },
) {
  const supabase = await createClient();
  const origin = appUrl().startsWith("http")
    ? appUrl()
    : `https://${appUrl()}`;

  const data: Record<string, string> = {};
  if (profile?.fullName?.trim()) {
    data.full_name = profile.fullName.trim();
  }
  if (profile?.title?.trim()) {
    data.title = profile.title.trim();
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
      data,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    console.error("invite magic link failed:", error.message);
    return { error: error.message };
  }

  return { success: true as const };
}

export { appUrl };
