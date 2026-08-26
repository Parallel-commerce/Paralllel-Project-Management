import { signOut } from "@/lib/actions/auth";
import { DesktopNav } from "@/components/desktop-nav";
import { GlobalSearch } from "@/components/global-search";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ParallelLogo } from "@/components/parallel-logo";
import { ProfileMenu } from "@/components/profile-menu";
import { getCurrentProfile, getSessionUser } from "@/lib/auth";
import { profileAvatarPublicUrl } from "@/lib/profile-avatar";

export async function AppHeader({
  isPlatformAdmin,
  isInternal = false,
  initialUnreadCount = 0,
}: {
  email?: string | null;
  isPlatformAdmin?: boolean;
  isInternal?: boolean;
  initialUnreadCount?: number;
} = {}) {
  const [{ user }, profile] = await Promise.all([
    getSessionUser(),
    getCurrentProfile(),
  ]);

  const platformAdmin =
    isPlatformAdmin ?? profile?.is_platform_admin ?? false;
  const email = profile?.email || user?.email || "";
  const fullName = profile?.full_name ?? null;
  const title = profile?.title ?? null;
  const baseUrl = profileAvatarPublicUrl(profile?.avatar_path ?? null);
  const avatarUrl = baseUrl
    ? `${baseUrl}?v=${encodeURIComponent(profile?.updated_at ?? "")}`
    : null;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur">
        <div className="app-container flex h-14 items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-5 self-stretch">
            <ParallelLogo className="h-6 w-auto sm:h-7" />
            <DesktopNav
              isPlatformAdmin={platformAdmin}
              isInternal={isInternal}
            />
          </div>
          <GlobalSearch />
          <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
            <NotificationBell initialUnreadCount={initialUnreadCount} />
            {user ? (
              <ProfileMenu
                email={email}
                fullName={fullName}
                title={title}
                avatarUrl={avatarUrl}
              />
            ) : null}
            <form action={signOut}>
              <button
                type="submit"
                className="min-h-9 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs sm:px-3 sm:text-sm hover:bg-[var(--surface-2)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <MobileBottomNav
        isPlatformAdmin={platformAdmin}
        isInternal={isInternal}
      />
    </>
  );
}
