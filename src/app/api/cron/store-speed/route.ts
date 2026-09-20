import { NextResponse } from "next/server";

import { captureScheduledStoreSpeed } from "@/lib/shopify/speed";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const result = await captureScheduledStoreSpeed(supabase);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not run store speed snapshots.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
