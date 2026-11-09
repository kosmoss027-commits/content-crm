// Прогревы: кампании и их дни. Все запросы ограничены projectId из контекста.
import { z } from "zod";
import { MEANING_VALUES, WARMUP_MAX_DAYS } from "@/config/warmups";
import { prisma } from "@/lib/db/prisma";
import { AppError, notFoundError } from "@/lib/db/errors";
import { assertCan, type ProjectContext } from "@/lib/db/access";
import { parseInput } from "@/lib/validation";
import { dateToDay, daysBetween, dayToDate, isDay } from "@/lib/content/dates";

const day = z.string().refine(isDay, "Дата в формате ГГГГ-ММ-ДД");
const meanings = z.array(z.string().refine((v) => MEANING_VALUES.includes(v), "Неизвестный смысл")).max(MEANING_VALUES.length).default([]);

export async function listCampaigns(ctx: ProjectContext) {
  return prisma.warmupCampaign.findMany({
    where: { projectId: ctx.projectId },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { publications: true } } },
  });
}

export async function getCampaign(ctx: ProjectContext, id: string) {
  const campaign = await prisma.warmupCampaign.findFirst({
    where: { id, projectId: ctx.projectId },
    include: { days: { orderBy: { date: "asc" } } },
  });
  if (!campaign) throw notFoundError();
  return campaign;
}

export type CampaignDetails = Awaited<ReturnType<typeof getCampaign>>;

const campaignInput = z
  .object({
    name: z.string().trim().min(1, "Введите название").max(120, "Название — до 120 символов"),
    product: z.string().trim().max(200, "Продукт — до 200 символов").default(""),
    startDate: day,
    endDate: day,
    salesStartDate: day.nullable().default(null),
    note: z.string().max(5000, "Заметка — до 5000 символов").default(""),
  })
  .refine((c) => c.endDate >= c.startDate, "Конец прогрева не раньше начала")
  .refine((c) => daysBetween(c.startDate, c.endDate) < WARMUP_MAX_DAYS, `Прогрев — не длиннее ${WARMUP_MAX_DAYS} дней (3 месяца)`)
  .refine((c) => !c.salesStartDate || (c.salesStartDate >= c.startDate && c.salesStartDate <= c.endDate), "Старт продаж — внутри периода прогрева");

export type CampaignInput = z.input<typeof campaignInput>;

function toData(input: z.output<typeof campaignInput>) {
  return {
    name: input.name,
    product: input.product,
    note: input.note,
    startDate: dayToDate(input.startDate),
    endDate: dayToDate(input.endDate),
    salesStartDate: input.salesStartDate ? dayToDate(input.salesStartDate) : null,
  };
}

export async function createCampaign(ctx: ProjectContext, raw: CampaignInput) {
  assertCan(ctx, "content.manage");
  const input = parseInput(campaignInput, raw);
  return prisma.warmupCampaign.create({ data: { ...toData(input), workspaceId: ctx.workspaceId, projectId: ctx.projectId }, select: { id: true } });
}

async function findOwn(ctx: ProjectContext, id: string) {
  const campaign = await prisma.warmupCampaign.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true, startDate: true, endDate: true } });
  if (!campaign) throw notFoundError();
  return campaign;
}

export async function updateCampaign(ctx: ProjectContext, id: string, raw: CampaignInput) {
  assertCan(ctx, "content.manage");
  const input = parseInput(campaignInput, raw);
  const campaign = await findOwn(ctx, id);
  await prisma.$transaction([
    prisma.warmupCampaign.update({ where: { id: campaign.id }, data: toData(input) }),
    // Дни вне нового периода больше не относятся к кампании
    prisma.warmupDay.deleteMany({ where: { campaignId: campaign.id, OR: [{ date: { lt: dayToDate(input.startDate) } }, { date: { gt: dayToDate(input.endDate) } }] } }),
  ]);
}

export async function deleteCampaign(ctx: ProjectContext, id: string) {
  assertCan(ctx, "content.manage");
  const campaign = await findOwn(ctx, id);
  await prisma.warmupCampaign.delete({ where: { id: campaign.id } });
}

const dayInput = z.object({
  kind: z.enum(["START", "LIVE", "IMPORTANT", "OPEN_DAY"]).nullable().default(null),
  meaning: z.string().trim().max(500, "Значение дня — до 500 символов").default(""),
  telegramPost: z.string().max(2000, "Пост в Telegram — до 2000 символов").default(""),
  stories: z.string().max(2000, "Сторис — до 2000 символов").default(""),
  meanings,
});

export type DayInput = z.input<typeof dayInput>;

/** Строка таблицы «по дням». Пустой день удаляется, чтобы не копить пустые записи. */
export async function saveWarmupDay(ctx: ProjectContext, campaignId: string, date: string, raw: DayInput) {
  assertCan(ctx, "content.manage");
  const input = parseInput(dayInput, raw);
  const target = parseInput(day, date);
  const campaign = await findOwn(ctx, campaignId);
  if (target < dateToDay(campaign.startDate) || target > dateToDay(campaign.endDate)) throw new AppError("VALIDATION", "Этот день вне периода прогрева.");
  const empty = !input.kind && !input.meaning && !input.telegramPost.trim() && !input.stories.trim() && input.meanings.length === 0;
  if (empty) {
    await prisma.warmupDay.deleteMany({ where: { campaignId: campaign.id, date: dayToDate(target) } });
    return;
  }
  await prisma.warmupDay.upsert({
    where: { campaignId_date: { campaignId: campaign.id, date: dayToDate(target) } },
    update: input,
    create: { ...input, date: dayToDate(target), campaignId: campaign.id, workspaceId: ctx.workspaceId, projectId: ctx.projectId },
  });
}

/** Публикации проекта в окне календаря — точки по рубрикам. */
export async function calendarPublications(ctx: ProjectContext, from: string, to: string) {
  return prisma.publication.findMany({
    where: { projectId: ctx.projectId, date: { gte: dayToDate(from), lte: dayToDate(to) } },
    orderBy: { date: "asc" },
    select: { id: true, title: true, date: true, rubric: true, platform: true, status: true, campaignId: true },
  });
}

/** Для выбора кампании в карточке публикации. */
export async function campaignOptions(ctx: ProjectContext) {
  return prisma.warmupCampaign.findMany({ where: { projectId: ctx.projectId }, orderBy: { startDate: "desc" }, select: { id: true, name: true } });
}
