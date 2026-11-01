// Лента залётов, радар трендов, отметки «В работу» и журнал сбора — в рамках проекта.
// Ролики хранятся в общем банке, проект видит только ролики аккаунтов из своей разведки.
import type { Market } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { notFoundError } from "@/lib/db/errors";
import { assertCan, type ProjectContext } from "@/lib/db/access";

const HOUR_MS = 60 * 60 * 1000;
const FEED_LIMIT = 120;

export type FeedFilters = {
  market?: Market;
  niche?: string;
  periodDays?: number;
  minMultiplier?: number;
  maxDurationSec?: number;
};

async function thresholds(ctx: ProjectContext) {
  return prisma.project.findUniqueOrThrow({
    where: { id: ctx.projectId },
    select: { viralThreshold: true, anomalyThreshold: true },
  });
}

/** Ролики аккаунтов, которые проект отслеживает (кроме кандидатов). */
function projectReelsWhere(ctx: ProjectContext, filters: Pick<FeedFilters, "market" | "niche"> = {}): Prisma.ScrapedReelWhereInput {
  return {
    account: {
      watches: {
        some: {
          projectId: ctx.projectId,
          status: { not: "CANDIDATE" },
          ...(filters.market ? { market: filters.market } : {}),
          ...(filters.niche ? { niche: filters.niche } : {}),
        },
      },
    },
  };
}

const reelInclude = (ctx: ProjectContext) =>
  ({
    account: { select: { username: true, fullName: true, avatarUrl: true, medianViews: true, followers: true } },
    marks: { where: { projectId: ctx.projectId }, select: { id: true } },
  }) satisfies Prisma.ScrapedReelInclude;

export type FeedReel = Prisma.ScrapedReelGetPayload<{ include: ReturnType<typeof reelInclude> }>;

export async function listViralFeed(ctx: ProjectContext, filters: FeedFilters): Promise<FeedReel[]> {
  const { viralThreshold } = await thresholds(ctx);
  return prisma.scrapedReel.findMany({
    where: {
      ...projectReelsWhere(ctx, filters),
      multiplier: { gte: filters.minMultiplier ?? viralThreshold },
      ...(filters.periodDays ? { postedAt: { gte: new Date(Date.now() - filters.periodDays * 24 * HOUR_MS) } } : {}),
      ...(filters.maxDurationSec ? { durationSec: { lte: filters.maxDurationSec } } : {}),
    },
    orderBy: [{ multiplier: "desc" }],
    take: FEED_LIMIT,
    include: reelInclude(ctx),
  });
}

export async function listRadar(ctx: ProjectContext, hours: number): Promise<FeedReel[]> {
  const { anomalyThreshold } = await thresholds(ctx);
  return prisma.scrapedReel.findMany({
    where: {
      ...projectReelsWhere(ctx),
      multiplier: { gte: anomalyThreshold },
      postedAt: { gte: new Date(Date.now() - hours * HOUR_MS) },
    },
    orderBy: [{ postedAt: "desc" }],
    take: FEED_LIMIT,
    include: reelInclude(ctx),
  });
}

/** «В работу» / снять отметку. Ролик должен принадлежать аккаунту из разведки проекта. */
export async function toggleReelMark(ctx: ProjectContext, reelId: string): Promise<boolean> {
  assertCan(ctx, "research.manage");
  const reel = await prisma.scrapedReel.findFirst({ where: { id: reelId, ...projectReelsWhere(ctx) }, select: { id: true } });
  if (!reel) throw notFoundError();

  const existing = await prisma.reelMark.findUnique({ where: { projectId_reelId: { projectId: ctx.projectId, reelId } } });
  if (existing) {
    await prisma.reelMark.delete({ where: { id: existing.id } });
    return false;
  }
  await prisma.reelMark.create({ data: { workspaceId: ctx.workspaceId, projectId: ctx.projectId, reelId } });
  return true;
}

export type RunView = {
  id: string;
  kind: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  accounts: string[];
  failed: string[];
  itemsCount: number;
  costUsd: number;
  estimatedUsd: number;
  error: string | null;
};

/**
 * Журнал сбора для проекта. Плановый сбор общий на систему, поэтому показываем из каждого
 * запуска только аккаунты этого проекта — ники чужих проектов не раскрываются.
 */
export async function listRunsForProject(ctx: ProjectContext, limit = 30): Promise<RunView[]> {
  const entries = await prisma.watchlistEntry.findMany({
    where: { projectId: ctx.projectId },
    select: { account: { select: { username: true } } },
  });
  const own = new Set(entries.map((e) => e.account.username));
  if (own.size === 0) return [];

  const runs = await prisma.scrapeRun.findMany({
    where: { usernames: { hasSome: [...own] } },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return runs.map((run) => ({
    id: run.id,
    kind: run.kind,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    accounts: run.usernames.filter((u) => own.has(u)),
    failed: run.failedAccounts.filter((f) => own.has(f.split(":")[0])),
    itemsCount: run.itemsCount,
    costUsd: run.costUsd,
    estimatedUsd: run.estimatedUsd,
    error: run.error,
  }));
}

export async function hasRunningRuns(): Promise<boolean> {
  return (await prisma.scrapeRun.count({ where: { status: "RUNNING" } })) > 0;
}

export async function updateThresholds(ctx: ProjectContext, viralThreshold: number, anomalyThreshold: number) {
  assertCan(ctx, "project.manage");
  await prisma.project.update({ where: { id: ctx.projectId }, data: { viralThreshold, anomalyThreshold } });
}
