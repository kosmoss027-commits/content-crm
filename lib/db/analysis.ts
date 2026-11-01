// Карта бренда, разборы, банк хуков, «Что работает» и банк приёмов — в рамках проекта.
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { notFoundError } from "@/lib/db/errors";
import { assertCan, type ProjectContext } from "@/lib/db/access";
import { parseInput } from "@/lib/validation";

const DAY_MS = 24 * 60 * 60 * 1000;
const text = (max: number) => z.string().trim().max(max, `Не длиннее ${max} символов`).default("");

export const brandInput = z.object({
  author: text(1000),
  niche: text(500),
  audience: text(1500),
  products: text(1500),
  tone: text(1000),
  forbidden: text(1000),
  examples: text(6000),
  topics: text(1500),
  keywords: text(1500),
  exclusions: text(1000),
  relevanceThreshold: z.coerce.number().int().min(0, "Порог — от 0").max(10, "Порог — до 10").default(6),
  scriptTemplate: text(4000),
});

export async function getBrandMap(ctx: ProjectContext) {
  return prisma.brandMap.findUnique({ where: { projectId: ctx.projectId } });
}

export async function saveBrandMap(ctx: ProjectContext, input: unknown) {
  assertCan(ctx, "research.manage");
  const data = parseInput(brandInput, input);
  await prisma.brandMap.upsert({
    where: { projectId: ctx.projectId },
    create: { ...data, projectId: ctx.projectId, workspaceId: ctx.workspaceId },
    update: data,
  });
}

/** Ролик доступен проекту, только если его автор в разведке проекта. */
async function assertProjectReel(ctx: ProjectContext, reelId: string) {
  const reel = await prisma.scrapedReel.findFirst({
    where: { id: reelId, account: { watches: { some: { projectId: ctx.projectId } } } },
    select: { id: true },
  });
  if (!reel) throw notFoundError();
}

/** «Разобрать сейчас» / «В работу»: ролик идёт в очередь первым и без отсева. */
export async function requestAnalysis(ctx: ProjectContext, reelId: string) {
  assertCan(ctx, "research.manage");
  await assertProjectReel(ctx, reelId);
  await prisma.reelAnalysis.upsert({
    where: { projectId_reelId: { projectId: ctx.projectId, reelId } },
    create: { workspaceId: ctx.workspaceId, projectId: ctx.projectId, reelId, priority: true },
    update: { priority: true },
  });
  await prisma.reelAnalysis.updateMany({
    where: { projectId: ctx.projectId, reelId, status: { in: ["FILTERED", "FAILED"] } },
    data: { status: "QUEUED", error: null },
  });
}

export async function getReelWithAnalysis(ctx: ProjectContext, reelId: string) {
  const reel = await prisma.scrapedReel.findFirst({
    where: { id: reelId, account: { watches: { some: { projectId: ctx.projectId } } } },
    include: {
      account: { select: { username: true, medianViews: true, followers: true } },
      media: { select: { transcript: true, error: true } },
      analyses: { where: { projectId: ctx.projectId }, include: { scripts: { select: { id: true, title: true, status: true } } } },
      hypotheses: { where: { hypothesis: { projectId: ctx.projectId } }, select: { hypothesis: { select: { id: true, text: true } } } },
    },
  });
  if (!reel) throw notFoundError();
  return { ...reel, analysis: reel.analyses[0] ?? null };
}

export async function analysisCounts(ctx: ProjectContext) {
  const rows = await prisma.reelAnalysis.groupBy({ by: ["status"], where: { projectId: ctx.projectId }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.status, r._count])) as Partial<Record<string, number>>;
}

export async function listHooks(ctx: ProjectContext, filters: { type?: string; q?: string }) {
  return prisma.reelAnalysis.findMany({
    where: {
      projectId: ctx.projectId,
      status: "ANALYZED",
      hook: { not: null, ...(filters.q ? { contains: filters.q, mode: "insensitive" } : {}) },
      ...(filters.type ? { hookType: filters.type } : {}),
    },
    orderBy: { reel: { multiplier: "desc" } },
    take: 200,
    select: {
      id: true,
      hook: true,
      hookType: true,
      topic: true,
      reel: { select: { id: true, url: true, multiplier: true, views: true, account: { select: { username: true } } } },
    },
  });
}

export type WorksRow = { label: string; count: number; avgMultiplier: number };

function aggregate(items: { key: string | null; multiplier: number }[]): WorksRow[] {
  const groups = new Map<string, number[]>();
  for (const { key, multiplier } of items) {
    if (!key) continue;
    const normalized = key.trim().toLowerCase();
    groups.set(normalized, [...(groups.get(normalized) ?? []), multiplier]);
  }
  return [...groups.entries()]
    .map(([label, values]) => ({
      label,
      count: values.length,
      avgMultiplier: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count || b.avgMultiplier - a.avgMultiplier)
    .slice(0, 10);
}

function durationBucket(seconds: number | null): string | null {
  if (!seconds) return null;
  if (seconds <= 15) return "до 15 с";
  if (seconds <= 30) return "15–30 с";
  if (seconds <= 60) return "30–60 с";
  return "дольше минуты";
}

/** «Что работает»: что чаще всего встречается среди разобранных залётов за период. */
export async function whatWorks(ctx: ProjectContext, periodDays: number) {
  const rows = await prisma.reelAnalysis.findMany({
    where: { projectId: ctx.projectId, status: "ANALYZED", reel: { postedAt: { gte: new Date(Date.now() - periodDays * DAY_MS) } } },
    select: { topic: true, format: true, hookType: true, techniques: true, reel: { select: { multiplier: true, durationSec: true } } },
  });
  const m = (r: (typeof rows)[number]) => r.reel.multiplier ?? 0;
  return {
    total: rows.length,
    topics: aggregate(rows.map((r) => ({ key: r.topic, multiplier: m(r) }))),
    formats: aggregate(rows.map((r) => ({ key: r.format, multiplier: m(r) }))),
    hookTypes: aggregate(rows.map((r) => ({ key: r.hookType, multiplier: m(r) }))),
    durations: aggregate(rows.map((r) => ({ key: durationBucket(r.reel.durationSec), multiplier: m(r) }))),
    techniques: aggregate(rows.flatMap((r) => r.techniques.map((t) => ({ key: t, multiplier: m(r) })))),
  };
}

const techniqueInput = z.object({
  title: z.string().trim().min(1, "Назовите приём").max(120, "Не длиннее 120 символов"),
  description: text(1000),
  exampleUrl: z.string().trim().url("Ссылка-пример должна быть адресом").max(500).optional().or(z.literal("")),
});

export async function listTechniques(ctx: ProjectContext) {
  return prisma.technique.findMany({ where: { projectId: ctx.projectId }, orderBy: { createdAt: "desc" } });
}

export async function addTechnique(ctx: ProjectContext, input: unknown) {
  assertCan(ctx, "research.manage");
  const data = parseInput(techniqueInput, input);
  await prisma.technique.create({
    data: { ...data, exampleUrl: data.exampleUrl || null, workspaceId: ctx.workspaceId, projectId: ctx.projectId },
  });
}

export async function removeTechnique(ctx: ProjectContext, techniqueId: string) {
  assertCan(ctx, "research.manage");
  const { count } = await prisma.technique.deleteMany({ where: { id: techniqueId, projectId: ctx.projectId } });
  if (count === 0) throw notFoundError();
}
