// Контент-план: публикации проекта. Все запросы ограничены projectId из контекста.
import { z } from "zod";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { PublicationStatus, ScriptStatus } from "@/lib/generated/prisma/enums";
import { REPEAT_AFTER_DAYS } from "@/config/content";
import { prisma } from "@/lib/db/prisma";
import { AppError, notFoundError } from "@/lib/db/errors";
import { assertCan, type ProjectContext } from "@/lib/db/access";
import { parseInput } from "@/lib/validation";
import { addDays, dateToDay, dayToDate, isDay, monthEnd, monthStart } from "@/lib/content/dates";
import type { StatRow } from "@/lib/content/stats";

const platform = z.enum(["INSTAGRAM", "STORIES", "THREADS", "TELEGRAM", "YOUTUBE"]);
const type = z.enum(["SALES", "ENGAGING", "EXPERT", "CASE", "ANNOUNCE"]);
const status = z.enum(["IDEA", "SCRIPT", "SHOOT", "EDIT", "READY", "PUBLISHED"]);
const count = z.number().int("Только целое число").min(0, "Не меньше 0").max(1_000_000_000).nullable();
const day = z
  .string()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isDay(v), "Дата в формате ГГГГ-ММ-ДД");

export const publicationInput = z.object({
  title: z.string().trim().min(1, "Введите название").max(200, "Название — до 200 символов"),
  platform,
  type,
  status,
  date: day,
  text: z.string().max(5000, "Текст — до 5000 символов").default(""),
  note: z.string().max(10000, "Заметка — до 10000 символов").default(""),
  codeWord: z
    .string()
    .trim()
    .max(50, "Кодовое слово — до 50 символов")
    .nullable()
    .default(null)
    .transform((v) => (v ? v : null)),
  labels: z.array(z.string().trim().min(1).max(30, "Метка — до 30 символов")).max(10, "Не больше 10 меток").default([]),
  referenceUrl: z.string().trim().max(500).nullable().default(null),
  isStar: z.boolean().default(false),
  // Вносится вручную (и статистика, пока Instagram не подключён)
  views: count.default(null),
  reach: count.default(null),
  likes: count.default(null),
  comments: count.default(null),
  saves: count.default(null),
  shares: count.default(null),
  profileVisits: count.default(null),
  linkClicks: count.default(null),
  follows: count.default(null),
  coldAudiencePct: z.number().min(0, "От 0 до 100").max(100, "От 0 до 100").nullable().default(null),
});

export type PublicationInput = z.input<typeof publicationInput>;

const listSelect = {
  id: true,
  platform: true,
  type: true,
  status: true,
  date: true,
  title: true,
  text: true,
  codeWord: true,
  labels: true,
  isStar: true,
  views: true,
  igMediaId: true,
  permalink: true,
  thumbnailUrl: true,
} satisfies Prisma.PublicationSelect;

export type PlanItem = Prisma.PublicationGetPayload<{ select: typeof listSelect }>;

/** Публикации с датой в [from, to] (дни включительно) и идеи без даты. */
export async function listPlan(ctx: ProjectContext, from: string, to: string, filters: ListFilters = {}) {
  const base = { ...filtersWhere(filters), projectId: ctx.projectId };
  const [dated, undated] = await Promise.all([
    prisma.publication.findMany({
      where: { ...base, date: { gte: dayToDate(from), lte: dayToDate(to) } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: listSelect,
    }),
    prisma.publication.findMany({
      where: { ...base, date: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: listSelect,
    }),
  ]);
  return { dated, undated };
}

export type ListFilters = { platform?: string; type?: string; status?: string; label?: string };

/** Общие фильтры плана: площадка, тип, статус, метка. Неизвестные значения игнорируются. */
export function filtersWhere(filters: ListFilters): Prisma.PublicationWhereInput {
  const where: Prisma.PublicationWhereInput = {};
  const p = platform.safeParse(filters.platform);
  const t = type.safeParse(filters.type);
  const s = status.safeParse(filters.status);
  if (p.success) where.platform = p.data;
  if (t.success) where.type = t.data;
  if (s.success) where.status = s.data;
  if (filters.label) where.labels = { has: filters.label };
  return where;
}

export async function listPublications(ctx: ProjectContext, filters: ListFilters = {}) {
  return prisma.publication.findMany({
    where: { ...filtersWhere(filters), projectId: ctx.projectId },
    orderBy: [{ date: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: 300,
    select: listSelect,
  });
}

export async function projectLabels(ctx: ProjectContext): Promise<string[]> {
  const rows = await prisma.publication.findMany({ where: { projectId: ctx.projectId }, select: { labels: true } });
  return [...new Set(rows.flatMap((r) => r.labels))].sort((a, b) => a.localeCompare(b, "ru"));
}

/** «За месяц опубликовано X из Y» — по дням плана в месяце, куда попадает day. */
export async function monthSummary(ctx: ProjectContext, day: string) {
  const range = { gte: dayToDate(monthStart(day)), lte: dayToDate(monthEnd(day)) };
  const [planned, published] = await Promise.all([
    prisma.publication.count({ where: { projectId: ctx.projectId, date: range } }),
    prisma.publication.count({ where: { projectId: ctx.projectId, date: range, status: "PUBLISHED" } }),
  ]);
  return { planned, published };
}

export async function getPublication(ctx: ProjectContext, id: string) {
  const publication = await prisma.publication.findFirst({
    where: { id, projectId: ctx.projectId },
    include: {
      referenceReel: { select: { id: true, url: true, shortCode: true, views: true, account: { select: { username: true } } } },
      script: { select: { id: true, title: true } },
    },
  });
  if (!publication) throw notFoundError();
  return publication;
}

export type PublicationDetails = Awaited<ReturnType<typeof getPublication>>;

async function findOwn(ctx: ProjectContext, id: string) {
  const row = await prisma.publication.findFirst({
    where: { id, projectId: ctx.projectId },
    select: { id: true, igMediaId: true, referenceReelId: true, referenceReel: { select: { url: true } } },
  });
  if (!row) throw notFoundError();
  return row;
}

const SHORTCODE_RE = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p)\/([\w-]+)/i;

/** Ссылка на ролик → id ролика из разведки этого проекта (чужие проекты не видны). */
async function resolveReference(ctx: ProjectContext, url: string | null): Promise<string | null> {
  if (!url) return null;
  const shortCode = url.match(SHORTCODE_RE)?.[1];
  if (!shortCode) throw new AppError("VALIDATION", "Вставьте ссылку на ролик Instagram (…/reel/…)");
  const reel = await prisma.scrapedReel.findFirst({
    where: { shortCode, account: { watches: { some: { projectId: ctx.projectId, status: { not: "CANDIDATE" } } } } },
    select: { id: true },
  });
  if (!reel) throw new AppError("VALIDATION", "Этого ролика нет в разведке проекта.");
  return reel.id;
}

function toData(input: z.output<typeof publicationInput>, fromInstagram: boolean) {
  const { referenceUrl, date, views, reach, likes, comments, saves, shares, ...rest } = input;
  void referenceUrl;
  // Статистику из Instagram руками не перезаписываем
  const apiStats = fromInstagram ? {} : { views, reach, likes, comments, saves, shares };
  return { ...rest, ...apiStats, date: date ? dayToDate(date) : null };
}

export async function createPublication(ctx: ProjectContext, raw: PublicationInput) {
  assertCan(ctx, "content.manage");
  const input = parseInput(publicationInput, raw);
  const referenceReelId = await resolveReference(ctx, input.referenceUrl);
  return prisma.publication.create({
    data: { ...toData(input, false), referenceReelId, workspaceId: ctx.workspaceId, projectId: ctx.projectId },
    select: { id: true },
  });
}

export async function updatePublication(ctx: ProjectContext, id: string, raw: PublicationInput) {
  assertCan(ctx, "content.manage");
  const input = parseInput(publicationInput, raw);
  const own = await findOwn(ctx, id);
  // Ссылка не менялась — оставляем референс как есть, даже если аккаунт уже убран из разведки
  const unchanged = own.referenceReelId !== null && input.referenceUrl === own.referenceReel?.url;
  const referenceReelId = unchanged ? own.referenceReelId : await resolveReference(ctx, input.referenceUrl);
  await prisma.publication.update({ where: { id: own.id }, data: { ...toData(input, own.igMediaId !== null), referenceReelId } });
}

/** Перетаскивание карточки: новый день (или null — в «Без даты») и, если указана, площадка. */
export async function movePublication(ctx: ProjectContext, id: string, target: { date: string | null; platform?: string }) {
  assertCan(ctx, "content.manage");
  const date = parseInput(day, target.date);
  const nextPlatform = target.platform === undefined ? undefined : parseInput(platform, target.platform);
  const own = await findOwn(ctx, id);
  await prisma.publication.update({
    where: { id: own.id },
    data: { date: date ? dayToDate(date) : null, ...(nextPlatform ? { platform: nextPlatform } : {}) },
  });
}

export async function deletePublication(ctx: ProjectContext, id: string) {
  assertCan(ctx, "content.manage");
  const own = await findOwn(ctx, id);
  await prisma.publication.delete({ where: { id: own.id } });
}

export async function toggleStar(ctx: ProjectContext, id: string): Promise<boolean> {
  assertCan(ctx, "content.manage");
  const row = await prisma.publication.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true, isStar: true } });
  if (!row) throw notFoundError();
  await prisma.publication.update({ where: { id: row.id }, data: { isStar: !row.isStar } });
  return !row.isStar;
}

/** «Повторить через неделю»: копия без статистики, дата +7 дней (или от сегодня, если даты не было). */
export async function repeatPublication(ctx: ProjectContext, id: string, today: string) {
  assertCan(ctx, "content.manage");
  const source = await prisma.publication.findFirst({ where: { id, projectId: ctx.projectId } });
  if (!source) throw notFoundError();
  const baseDay = source.date ? dateToDay(source.date) : today;
  return prisma.publication.create({
    data: {
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      platform: source.platform,
      type: source.type,
      status: "IDEA",
      date: dayToDate(addDays(baseDay, REPEAT_AFTER_DAYS)),
      title: source.title,
      text: source.text,
      note: source.note,
      codeWord: source.codeWord,
      labels: source.labels,
      referenceReelId: source.referenceReelId,
    },
    select: { id: true, date: true },
  });
}

const statSelect = {
  id: true,
  title: true,
  date: true,
  platform: true,
  type: true,
  isStar: true,
  permalink: true,
  views: true,
  reach: true,
  likes: true,
  comments: true,
  saves: true,
  shares: true,
  avgWatchSec: true,
  profileVisits: true,
  linkClicks: true,
  follows: true,
  coldAudiencePct: true,
} satisfies Prisma.PublicationSelect;

/** Опубликованное в периоде (null — за всё время) для статистики. */
export async function publishedRows(ctx: ProjectContext, range: { from: string; to: string } | null, filters: ListFilters = {}): Promise<StatRow[]> {
  const rows = await prisma.publication.findMany({
    where: {
      ...filtersWhere({ ...filters, status: undefined }),
      projectId: ctx.projectId,
      status: "PUBLISHED",
      date: range ? { gte: dayToDate(range.from), lte: dayToDate(range.to) } : { not: null },
    },
    // Берём самые свежие 2000 и разворачиваем по возрастанию даты для графика
    orderBy: { date: "desc" },
    take: 2000,
    select: statSelect,
  });
  return rows.reverse().map(({ date, ...row }) => ({ ...row, day: dateToDay(date!) }));
}

const SCRIPT_TO_PUBLICATION: Record<ScriptStatus, PublicationStatus> = {
  REVIEW: "SCRIPT",
  SHOOT: "SHOOT",
  EDIT: "EDIT",
  PUBLISH: "READY",
  PUBLISHED: "PUBLISHED",
};

type Shot = { text: string; shoot: string };

function scriptNote(script: { hook: string; shots: unknown; ending: string }): string {
  const shots = Array.isArray(script.shots) ? (script.shots as Shot[]) : [];
  return [
    `Хук: ${script.hook}`,
    ...shots.map((shot, i) => `Кадр ${i + 1}: ${shot.text}${shot.shoot ? `\n  Что снимать: ${shot.shoot}` : ""}`),
    `Финал: ${script.ending}`,
  ].join("\n");
}

/** Сценарий → карточка в плане. Один сценарий — одна карточка. */
export async function planFromScript(ctx: ProjectContext, scriptId: string, date: string | null) {
  assertCan(ctx, "content.manage");
  const planDay = parseInput(day, date);
  const script = await prisma.script.findFirst({
    where: { id: scriptId, projectId: ctx.projectId },
    include: { publication: { select: { id: true } }, analysis: { select: { reelId: true } } },
  });
  if (!script) throw notFoundError();
  if (script.publication) throw new AppError("CONFLICT", "Этот сценарий уже в контент-плане.");
  return prisma.publication.create({
    data: {
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      scriptId: script.id,
      title: script.title,
      text: script.caption,
      note: scriptNote(script),
      status: SCRIPT_TO_PUBLICATION[script.status],
      date: planDay ? dayToDate(planDay) : null,
      referenceReelId: script.analysis?.reelId ?? null,
    },
    select: { id: true },
  });
}
