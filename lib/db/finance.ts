// P&L: расходы проекта (вручную) и выручка из оплат клиентов, по месяцам. Только владелец.
import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/config/finance";
import { prisma } from "@/lib/db/prisma";
import { notFoundError } from "@/lib/db/errors";
import { assertCan, type ProjectContext } from "@/lib/db/access";
import { parseInput } from "@/lib/validation";
import { addMonths, dateToDay, dayToDate, isDay, monthEnd, monthStart } from "@/lib/content/dates";

const expenseInput = z.object({
  amountRub: z.number().int("Сумма — целое число рублей").min(1, "Сумма больше нуля").max(100_000_000, "Слишком большая сумма"),
  category: z.enum(EXPENSE_CATEGORIES),
  note: z.string().trim().max(500, "Заметка — до 500 символов").default(""),
  spentAt: z.string().refine(isDay, "Дата в формате ГГГГ-ММ-ДД"),
});

export type ExpenseInput = z.input<typeof expenseInput>;

export async function addExpense(ctx: ProjectContext, raw: ExpenseInput) {
  assertCan(ctx, "finance.manage");
  const input = parseInput(expenseInput, raw);
  return prisma.expense.create({
    data: { ...input, spentAt: dayToDate(input.spentAt), workspaceId: ctx.workspaceId, projectId: ctx.projectId },
    select: { id: true },
  });
}

export async function deleteExpense(ctx: ProjectContext, id: string) {
  assertCan(ctx, "finance.manage");
  const row = await prisma.expense.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!row) throw notFoundError();
  await prisma.expense.delete({ where: { id: row.id } });
}

export async function listExpenses(ctx: ProjectContext, month: string) {
  assertCan(ctx, "finance.manage");
  return prisma.expense.findMany({
    where: { projectId: ctx.projectId, spentAt: { gte: dayToDate(monthStart(month)), lte: dayToDate(monthEnd(month)) } },
    orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
  });
}

export type PnlMonth = { month: string; revenueRub: number; expensesRub: number; profitRub: number; byCategory: Record<string, number> };

/** Месяцы от старого к новому: выручка (оплаты), расходы по категориям, прибыль. */
export async function pnlReport(ctx: ProjectContext, today: string, monthsBack: number): Promise<PnlMonth[]> {
  assertCan(ctx, "finance.manage");
  const months = Array.from({ length: monthsBack + 1 }, (_, i) => addMonths(today, i - monthsBack));
  const range = { gte: dayToDate(months[0]), lte: dayToDate(monthEnd(today)) };
  const [payments, expenses] = await Promise.all([
    prisma.payment.findMany({ where: { projectId: ctx.projectId, paidAt: range }, select: { amountRub: true, paidAt: true } }),
    prisma.expense.findMany({ where: { projectId: ctx.projectId, spentAt: range }, select: { amountRub: true, spentAt: true, category: true } }),
  ]);
  return months.map((month) => {
    const key = month.slice(0, 7);
    const revenueRub = payments.filter((p) => dateToDay(p.paidAt).startsWith(key)).reduce((sum, p) => sum + p.amountRub, 0);
    const own = expenses.filter((e) => dateToDay(e.spentAt).startsWith(key));
    const byCategory: Record<string, number> = {};
    for (const e of own) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amountRub;
    const expensesRub = own.reduce((sum, e) => sum + e.amountRub, 0);
    return { month, revenueRub, expensesRub, profitRub: revenueRub - expensesRub, byCategory };
  });
}
