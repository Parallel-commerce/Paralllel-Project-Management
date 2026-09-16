import { requireCrmUser } from "@/lib/auth";
import { buildCrmCompaniesCsv } from "@/lib/crm-export";

export const maxDuration = 60;

export async function GET() {
  const { supabase } = await requireCrmUser();
  const result = await buildCrmCompaniesCsv(supabase);
  if ("error" in result) {
    return new Response(result.error, { status: 500 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="parallel-crm-companies-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
