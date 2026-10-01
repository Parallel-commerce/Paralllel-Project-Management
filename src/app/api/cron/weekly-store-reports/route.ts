import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { runWeeklyStoreReports } from "@/lib/weekly-store-reports";

export const maxDuration = 800;

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
    const result = await runWeeklyStoreReports(supabase);
    revalidatePath("/home");
    for (const item of result.results) {
      revalidatePath(`/projects/${item.projectId}/reports`);
      if (item.reportId) {
        revalidatePath(`/projects/${item.projectId}/reports/${item.reportId}`);
      }
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not generate weekly store reports.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
