import Link from "next/link";

import { signOut } from "@/lib/actions/auth";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ParallelLogo } from "@/components/parallel-logo";
import { ProfileMenu } from "@/components/profile-menu";
import { profileAvatarPublicUrl } from "@/lib/profile-avatar";
import { createClient } from "@/lib/supabase/server";

export async function AppHeader({
  isPlatformAdmin,
}: {
  email?: string | null;
  isPlatformAdmin?: boolean;
} = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let platformAdmin = isPlatformAdmin ?? false;
  let email = user?.email ?? "";
  let fullName: string | null = null;
  let title: string | null = null;
  let avatarUrl: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "email, full_name, title, avatar_path, is_platform_admin, updated_at",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      email = profile.email || email;
      fullName = profile.full_name;
      title = profile.title;
      const baseUrl = profileAvatarPublicUrl(profile.avatar_path);
      avatarUrl = baseUrl
        ? `${baseUrl}?v=${encodeURIComponent(profile.updated_at)}`
        : null;
      if (isPlatformAdmin === undefined) {
        platformAdmin = profile.is_platform_admin ?? false;
      }
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur">
        <div className="app-container flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-5">
            <ParallelLogo className="h-6 w-auto sm:h-7" />
            <nav className="hidden items-center gap-4 text-sm md:flex">
              <Link
                href="/projects"
                className="text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Projects
              </Link>
              <Link
                href="/tasks"
                className="text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                My work
              </Link>
              {platformAdmin ? (
                <Link
                  href="/users"
                  className="text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Users
                </Link>
              ) : null}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
            <NotificationBell />
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
      <MobileBottomNav isPlatformAdmin={platformAdmin} />
    </>
  );
}

export async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
