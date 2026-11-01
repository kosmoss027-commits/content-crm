// Учёт расходов на сбор. Ключ Apify общий на систему, поэтому и лимит общий.
import { SCRAPE_BUDGET } from "@/config/scraping";
import { prisma } from "@/lib/db/prisma";

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Потрачено с начала периода. Для незавершённых запусков берём оценку. */
async function spentSince(since: Date): Promise<{ usd: number; items: number }> {
  const runs = await prisma.scrapeRun.findMany({
    where: { startedAt: { gte: since }, status: { in: ["RUNNING", "SUCCEEDED", "FAILED"] } },
    select: { status: true, costUsd: true, estimatedUsd: true, itemsCount: true },
  });
  return runs.reduce(
    (acc, run) => ({
      usd: acc.usd + (run.status === "RUNNING" ? run.estimatedUsd : run.costUsd),
      items: acc.items + run.itemsCount,
    }),
    { usd: 0, items: 0 },
  );
}

export type SpendSummary = {
  today: { usd: number; items: number };
  month: { usd: number; items: number };
  monthlyLimitUsd: number;
  limitReached: boolean;
};

export async function getSpendSummary(now = new Date()): Promise<SpendSummary> {
  const [today, month] = await Promise.all([spentSince(startOfDay(now)), spentSince(startOfMonth(now))]);
  return {
    today,
    month,
    monthlyLimitUsd: SCRAPE_BUDGET.monthlyUsd,
    limitReached: month.usd >= SCRAPE_BUDGET.monthlyUsd,
  };
}

/** Сколько можно потратить на следующий запуск: не больше лимита запуска и остатка месяца. */
export async function availableForRun(now = new Date()): Promise<number> {
  const { usd } = await spentSince(startOfMonth(now));
  const remaining = SCRAPE_BUDGET.monthlyUsd - usd;
  return Math.max(0, Math.min(SCRAPE_BUDGET.perRunUsd, Math.floor(remaining * 100) / 100));
}
