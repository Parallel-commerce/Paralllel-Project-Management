import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  runMonthlyProgressReports,
  runMonthlyStoreReports,
} from "@/lib/weekly-store-reports";
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
    const started = Date.now();
    const performance = await runMonthlyProgressReports(supabase, {
      budgetMs: 90_000,
    });
    const remaining = 4 * 60 * 1000 - (Date.now() - started);
    const store = await runMonthlyStoreReports(supabase, {
      budgetMs: Math.max(0, remaining),
    });
    revalidatePath("/home");
    for (const item of [...performance.results, ...store.results]) {
      revalidatePath("/reports");
      revalidatePath(`/reports/${item.projectId}`);
      if (item.reportId) {
        revalidatePath(`/reports/${item.projectId}/${item.reportId}`);
      }
    }
    return NextResponse.json({ performance, store });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not generate monthly store reports.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
