import { type NextRequest } from "next/server";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { todayDay } from "@/lib/content/dates";
import { resolvePeriod, toCsv } from "@/lib/content/stats";
import { publishedRows } from "@/lib/db/publications";

// Выгрузка статистики в CSV с теми же фильтрами, что на странице.
export async function GET(request: NextRequest, { params }: RouteContext<"/p/[projectId]/stats/export">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "stats")) return new Response("Недостаточно прав", { status: 403 });

  const query = request.nextUrl.searchParams;
  const today = todayDay();
  const period = resolvePeriod(query.get("period") ?? undefined, today, { from: query.get("from") ?? undefined, to: query.get("to") ?? undefined });
  const rows = await publishedRows(ctx, period.current, {
    platform: query.get("platform") ?? undefined,
    type: query.get("type") ?? undefined,
    label: query.get("label") ?? undefined,
  });

  const name = period.current ? `stats_${period.current.from}_${period.current.to}.csv` : `stats_all_${today}.csv`;
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
