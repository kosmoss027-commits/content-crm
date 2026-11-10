import Link from "next/link";
import { EXPENSE_CATEGORIES, PNL_MONTHS_BACK } from "@/config/finance";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { dateToDay, isDay, monthEnd, monthStart, monthTitle, shortDay, todayDay } from "@/lib/content/dates";
import { listExpenses, pnlReport } from "@/lib/db/finance";
import { formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { DeleteExpenseButton, ExpenseForm } from "@/components/work/finance-forms";

export const metadata = { title: "P&L — Content CRM" };

export default async function PnlPage({ params, searchParams }: PageProps<"/p/[projectId]/pnl">) {
  const { projectId } = await params;
  const { m } = await searchParams;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "pnl")) return <NoAccess />;

  const today = todayDay();
  const selected = typeof m === "string" && isDay(`${m}-01`) ? `${m}-01` : monthStart(today);
  const [months, expenses] = await Promise.all([pnlReport(ctx, today, PNL_MONTHS_BACK), listExpenses(ctx, selected)]);
  const total = months.reduce((t, x) => ({ revenue: t.revenue + x.revenueRub, expenses: t.expenses + x.expensesRub }), { revenue: 0, expenses: 0 });
  const usedCategories = EXPENSE_CATEGORIES.filter((c) => months.some((x) => x.byCategory[c]));

  return (
    <>
      <PageHeader title="P&L" description="Выручка — из оплат клиентов, расходы — вносите сами. Суммы в рублях." />

      <div className="mb-8 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-2 font-medium">Месяц</th>
              <th className="p-2 text-right font-medium">Выручка</th>
              {usedCategories.map((c) => (
                <th key={c} className="p-2 text-right font-normal text-muted-foreground">
                  {c}
                </th>
              ))}
              <th className="p-2 text-right font-medium">Расходы</th>
              <th className="p-2 text-right font-medium">Прибыль</th>
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((row) => (
              <tr key={row.month} className={cn("border-t", row.month === selected && "bg-muted/40")}>
                <td className="p-2">
                  <Link href={`/p/${projectId}/pnl?m=${row.month.slice(0, 7)}`} className="hover:underline">
                    {monthTitle(row.month)}
                  </Link>
                </td>
                <td className="p-2 text-right tabular-nums">{formatRub(row.revenueRub)}</td>
                {usedCategories.map((c) => (
                  <td key={c} className="p-2 text-right text-muted-foreground tabular-nums">
                    {row.byCategory[c] ? formatRub(row.byCategory[c]) : "—"}
                  </td>
                ))}
                <td className="p-2 text-right tabular-nums">{formatRub(row.expensesRub)}</td>
                <td className={cn("p-2 text-right font-semibold tabular-nums", row.profitRub < 0 && "text-destructive")}>{formatRub(row.profitRub)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/20 font-medium">
            <tr>
              <td className="p-2">Итого за {months.length} мес.</td>
              <td className="p-2 text-right tabular-nums">{formatRub(total.revenue)}</td>
              {usedCategories.map((c) => (
                <td key={c} />
              ))}
              <td className="p-2 text-right tabular-nums">{formatRub(total.expenses)}</td>
              <td className={cn("p-2 text-right tabular-nums", total.revenue - total.expenses < 0 && "text-destructive")}>{formatRub(total.revenue - total.expenses)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="grid gap-3">
        <h2 className="font-medium">Расходы: {monthTitle(selected).toLowerCase()}</h2>
        <ExpenseForm projectId={projectId} defaultDate={selected === monthStart(today) ? today : monthEnd(selected)} />
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">В этом месяце расходов нет.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-16 text-xs text-muted-foreground tabular-nums">{shortDay(dateToDay(e.spentAt))}</span>
                <span className="w-44 text-muted-foreground">{e.category}</span>
                <span className="flex-1">{e.note || "—"}</span>
                <span className="font-medium tabular-nums">{formatRub(e.amountRub)}</span>
                <DeleteExpenseButton projectId={projectId} id={e.id} />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Расходы на сервисы самой CRM (Apify, ИИ, распознавание речи) видны в Настройках → «Балансы и расходы».</p>
      </section>
    </>
  );
}
