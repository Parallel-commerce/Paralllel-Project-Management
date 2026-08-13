import { NextResponse, type NextRequest } from "next/server";

import { CANONICAL_APP_URL } from "@/lib/app-url";
import { updateSession } from "@/lib/supabase/middleware";

const LEGACY_HOSTS = new Set(["paralllel-project-management.vercel.app"]);

export async function middleware(request: NextRequest) {
  if (LEGACY_HOSTS.has(request.nextUrl.hostname)) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, CANONICAL_APP_URL);
    return NextResponse.redirect(url, 308);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
