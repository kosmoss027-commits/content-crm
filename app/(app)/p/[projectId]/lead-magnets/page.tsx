import { ExternalLinkIcon } from "lucide-react";
import { requireProjectContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/navigation";
import { shortDay, todayDay } from "@/lib/content/dates";
import { PERIODS, resolvePeriod } from "@/lib/content/stats";
import { listKeywords, magnetFunnel } from "@/lib/db/sales";
import { formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { MagnetForm, MagnetRowActions } from "@/components/sales/sales-forms";

export const metadata = { title: "ЛМ-воронка — Content CRM" };

const param = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
const selectClass = "h-8 rounded-md border bg-transparent px-2 text-sm";

export default async function LeadMagnetsPage({ params, searchParams }: PageProps<"/p/[projectId]/lead-magnets">) {
  const { projectId } = await params;
  const query = await searchParams;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "lead-magnets")) return <NoAccess />;

  const period = resolvePeriod(param(query.period) || "all", todayDay(), { from: param(query.from), to: param(query.to) });
  const [rows, keywords] = await Promise.all([magnetFunnel(ctx, period.current), listKeywords(ctx)]);
  const canEdit = can(ctx.role, "sales.manage");
  const keywordOptions = keywords.map((k) => ({ id: k.id, label: k.word }));

  return (
    <>
      <PageHeader
        title="ЛМ-воронка"
        description={`Лид-магнит → получили → стали клиентами → купили${period.current ? ` · с ${shortDay(period.current.from)} по ${shortDay(period.current.to)}` : " · за всё время"}`}
      />

      {canEdit && (
        <details className="mb-6 rounded-xl border p-3" open={rows.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">Добавить лид-магнит</summary>
          <div className="mt-3">
            <MagnetForm projectId={projectId} id={null} initial={{ name: "", description: "", url: "", keywordId: null }} keywords={keywordOptions} />
            <p className="mt-2 text-xs text-muted-foreground">
              Лид-магнит выдаётся по кодовому слову: кто написал слово — тот «получил». Слова заводятся в разделе «Кодовые слова».
            </p>
          </div>
        </details>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" method="get" aria-label="Период">
        <select name="period" defaultValue={period.key} className={selectClass} aria-label="Период">
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={param(query.from)} className={selectClass} aria-label="Свой период: с" />
        <input type="date" name="to" defaultValue={param(query.to)} className={selectClass} aria-label="Свой период: по" />
        <Button type="submit" size="sm">
          Показать
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Лид-магнитов пока нет.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2 font-medium">Лид-магнит</th>
                <th className="p-2 font-medium">Слово</th>
                <th className="p-2 text-right font-medium">Получили</th>
                <th className="p-2 text-right font-medium">Стали клиентами</th>
                <th className="p-2 text-right font-medium">Купили</th>
                <th className="p-2 text-right font-medium">Конверсия</th>
                <th className="p-2 text-right font-medium">Выручка</th>
                {canEdit && <th className="w-20 p-2" aria-label="Действия" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={cn("border-t align-top", row.archived && "text-muted-foreground")}>
                  <td className="p-2">
                    <div className="flex items-center gap-2 font-medium">
                      {row.name}
                      {row.archived && <Badge variant="outline">архив</Badge>}
                      {row.url && (
                        <a href={row.url} target="_blank" rel="noopener noreferrer" aria-label="Открыть лид-магнит" className="text-muted-foreground hover:text-foreground">
                          <ExternalLinkIcon className="size-3.5" />
                        </a>
                      )}
                    </div>
                    {row.description && <div className="text-xs text-muted-foreground">{row.description}</div>}
                  </td>
                  <td className="p-2 font-semibold tracking-wide">{row.keyword?.word ?? <span className="font-normal text-muted-foreground">не задано</span>}</td>
                  <td className="p-2 text-right tabular-nums">{row.got}</td>
                  <td className="p-2 text-right tabular-nums">{row.clients}</td>
                  <td className="p-2 text-right tabular-nums">{row.buyers}</td>
                  <td className="p-2 text-right tabular-nums">{row.conversionPct === null ? "—" : `${row.conversionPct.toFixed(1)}%`}</td>
                  <td className="p-2 text-right font-medium tabular-nums">{row.revenueRub ? formatRub(row.revenueRub) : "—"}</td>
                  {canEdit && (
                    <td className="p-1">
                      <MagnetRowActions
                        projectId={projectId}
                        magnet={{ id: row.id, archived: row.archived, data: { name: row.name, description: row.description, url: row.url, keywordId: row.keyword?.id ?? null } }}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Конверсия — сколько из получивших купили. Выручка — оплаты клиентов, пришедших по слову лид-магнита.</p>
    </>
  );
}
