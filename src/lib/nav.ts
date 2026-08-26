export type PrimaryNavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  showOnDesktop?: boolean;
  requiresInternal?: boolean;
  requiresPlatformAdmin?: boolean;
};

export const primaryNavItems: PrimaryNavItem[] = [
  {
    href: "/home",
    label: "Home",
    match: (pathname) => pathname === "/home" || pathname.startsWith("/home/"),
    showOnDesktop: false,
  },
  {
    href: "/projects",
    label: "Projects",
    match: (pathname) => pathname.startsWith("/projects"),
  },
  {
    href: "/crm",
    label: "CRM",
    match: (pathname) => pathname.startsWith("/crm"),
    requiresInternal: true,
  },
  {
    href: "/tasks",
    label: "My work",
    match: (pathname) => pathname.startsWith("/tasks"),
  },
  {
    href: "/messages",
    label: "Messages",
    match: (pathname) => pathname.startsWith("/messages"),
  },
  {
    href: "/users",
    label: "Users",
    match: (pathname) => pathname.startsWith("/users"),
    requiresPlatformAdmin: true,
  },
];

export function visibleNavItems(
  items: PrimaryNavItem[],
  {
    isInternal,
    isPlatformAdmin,
    desktop = false,
  }: {
    isInternal: boolean;
    isPlatformAdmin: boolean;
    desktop?: boolean;
  },
) {
  return items.filter((item) => {
    if (desktop && item.showOnDesktop === false) return false;
    if (item.requiresInternal && !isInternal) return false;
    if (item.requiresPlatformAdmin && !isPlatformAdmin) return false;
    return true;
  });
}
