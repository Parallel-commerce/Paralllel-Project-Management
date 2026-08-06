import { Suspense } from "react";

import { AppHeader } from "@/components/app-header";
import { NavigationProgress } from "@/components/navigation-progress";
import { getCurrentProfile, getSessionUser, getSupabase } from "@/lib/auth";

async function unreadNotificationCount(userId: string) {
  const supabase = await getSupabase();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ user }, profile] = await Promise.all([
    getSessionUser(),
    getCurrentProfile(),
  ]);

  const initialUnreadCount = user
    ? await unreadNotificationCount(user.id)
    : 0;

  return (
    <div className="app-shell min-h-full">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <AppHeader
        isPlatformAdmin={!!profile?.is_platform_admin}
        initialUnreadCount={initialUnreadCount}
      />
      {children}
    </div>
  );
}
