import { requireProjectContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/navigation";
import { shortDay, todayDay } from "@/lib/content/dates";
import { PERIODS, resolvePeriod } from "@/lib/content/stats";
import { keywordReport } from "@/lib/db/sales";
import { formatCount, formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { KeywordArchiveButton, KeywordForm } from "@/components/sales/sales-forms";

export const metadata = { title: "Кодовые слова — Content CRM" };

const param = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
const selectClass = "h-8 rounded-md border bg-transparent px-2 text-sm";

export default async function KeywordsPage({ params, searchParams }: PageProps<"/p/[projectId]/keywords">) {
  const { projectId } = await params;
  const query = await searchParams;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "keywords")) return <NoAccess />;

  const period = resolvePeriod(param(query.period) || "all", todayDay(), { from: param(query.from), to: param(query.to) });
  const showArchived = query.archived === "1";
  const rows = (await keywordReport(ctx, period.current)).filter((r) => showArchived || !r.archived);
  const canEdit = can(ctx.role, "sales.manage");
  const totals = rows.reduce(
    (t, r) => ({ posts: t.posts + r.posts, views: t.views + r.views, wrote: t.wrote + r.wrote, leads: t.leads + r.leads, payments: t.payments + r.payments, revenueRub: t.revenueRub + r.revenueRub }),
    { posts: 0, views: 0, wrote: 0, leads: 0, payments: 0, revenueRub: 0 },
  );

  return (
    <>
      <PageHeader
        title="Кодовые слова"
        description={`Какое слово и какой контент приносят заявки и деньги${period.current ? ` · с ${shortDay(period.current.from)} по ${shortDay(period.current.to)}` : " · за всё время"}`}
      />

      {canEdit && (
        <section className="mb-6 rounded-xl border p-3">
          <KeywordForm projectId={projectId} />
          <p className="mt-2 text-xs text-muted-foreground">
            Ставьте слово в карточке публикации («Кодовое слово») — тогда здесь посчитаются посты и просмотры. Заявки — в разделе «Заявки».
          </p>
        </section>
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
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} /> архивные
        </label>
        <Button type="submit" size="sm">
          Показать
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Пока нет кодовых слов. Добавьте первое — например, ПУТЬ.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2 font-medium">Слово</th>
                <th className="p-2 text-right font-medium">Постов</th>
                <th className="p-2 text-right font-medium">Просмотров</th>
                <th className="p-2 text-right font-medium">Написали</th>
                <th className="p-2 text-right font-medium" title="Сколько человек написали слово на 1000 просмотров">На 1000 просм.</th>
                <th className="p-2 text-right font-medium">Заявок</th>
                <th className="p-2 text-right font-medium">Оплат</th>
                <th className="p-2 text-right font-medium">Выручка</th>
                {canEdit && <th className="w-10 p-2" aria-label="Действия" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={cn("border-t", row.archived && "text-muted-foreground")}>
                  <td className="p-2">
                    <div className="flex items-center gap-2 font-semibold tracking-wide">
                      {row.word}
                      {row.archived && <Badge variant="outline">архив</Badge>}
                    </div>
                    {row.product && <div className="text-xs font-normal text-muted-foreground">{row.product}</div>}
                  </td>
                  <td className="p-2 text-right tabular-nums">{row.posts}</td>
                  <td className="p-2 text-right tabular-nums">{formatCount(row.views)}</td>
                  <td className="p-2 text-right tabular-nums">{row.wrote}</td>
                  <td className="p-2 text-right tabular-nums">{row.per1000 === null ? "—" : row.per1000.toFixed(1)}</td>
                  <td className="p-2 text-right tabular-nums">{row.leads}</td>
                  <td className="p-2 text-right tabular-nums">{row.payments}</td>
                  <td className="p-2 text-right font-medium tabular-nums">{row.revenueRub ? formatRub(row.revenueRub) : "—"}</td>
                  {canEdit && (
                    <td className="p-1 text-right">
                      <KeywordArchiveButton projectId={projectId} id={row.id} archived={row.archived} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/20 font-medium">
              <tr>
                <td className="p-2">Итого</td>
                <td className="p-2 text-right tabular-nums">{totals.posts}</td>
                <td className="p-2 text-right tabular-nums">{formatCount(totals.views)}</td>
                <td className="p-2 text-right tabular-nums">{totals.wrote}</td>
                <td className="p-2 text-right tabular-nums">{totals.views ? ((totals.wrote / totals.views) * 1000).toFixed(1) : "—"}</td>
                <td className="p-2 text-right tabular-nums">{totals.leads}</td>
                <td className="p-2 text-right tabular-nums">{totals.payments}</td>
                <td className="p-2 text-right tabular-nums">{formatRub(totals.revenueRub)}</td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        «Написали» — комментарии со словом (когда подключён Instagram) и ручные заявки с ним. Заявка засчитывается первой публикации, где человек написал слово. Выручка — оплаты клиентов, пришедших по слову.
      </p>
    </>
  );
}
