import { NextResponse } from "next/server";

/** Old magic-link emails land here. Sign-in is code-only now. */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
