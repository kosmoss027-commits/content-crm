// Деньги: кодовые слова, заявки, клиенты, оплаты. Все запросы ограничены projectId из контекста.
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { AppError, notFoundError } from "@/lib/db/errors";
import { assertCan, type ProjectContext } from "@/lib/db/access";
import { parseInput } from "@/lib/validation";
import { addDays, dayStartInZone, dayToDate, isDay } from "@/lib/content/dates";
import { normalizeHandle, normalizeWord } from "@/lib/crm/keywords";

const source = z.enum(["COMMENT", "DIRECT", "TELEGRAM", "OTHER"]);
const leadStatus = z.enum(["NEW", "IN_PROGRESS", "CLIENT", "LOST"]);
const text = (max: number, label: string) => z.string().trim().max(max, `${label} — до ${max} символов`).default("");
const optionalId = z
  .string()
  .nullable()
  .default(null)
  .transform((v) => (v ? v : null));
const day = z.string().refine(isDay, "Дата в формате ГГГГ-ММ-ДД");

// ─── Кодовые слова ───

export async function listKeywords(ctx: ProjectContext, includeArchived = false) {
  return prisma.keyword.findMany({
    where: { projectId: ctx.projectId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { word: "asc" }],
  });
}

const keywordInput = z.object({ word: z.string(), product: text(200, "Продукт"), note: text(1000, "Заметка") });

export async function createKeyword(ctx: ProjectContext, raw: z.input<typeof keywordInput>) {
  assertCan(ctx, "sales.manage");
  const input = parseInput(keywordInput, raw);
  const word = normalizeWord(input.word);
  if (!word) throw new AppError("VALIDATION", "Кодовое слово — одно слово из 2–30 букв или цифр, без пробелов.");
  const exists = await prisma.keyword.findUnique({ where: { projectId_word: { projectId: ctx.projectId, word } }, select: { id: true } });
  if (exists) throw new AppError("CONFLICT", `Слово «${word}» уже есть в проекте.`);
  return prisma.keyword.create({ data: { word, product: input.product, note: input.note, workspaceId: ctx.workspaceId, projectId: ctx.projectId } });
}

export async function updateKeyword(ctx: ProjectContext, id: string, raw: { product?: string; note?: string; archived?: boolean }) {
  assertCan(ctx, "sales.manage");
  const input = parseInput(z.object({ product: text(200, "Продукт").optional(), note: text(1000, "Заметка").optional(), archived: z.boolean().optional() }), raw);
  const keyword = await prisma.keyword.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!keyword) throw notFoundError();
  const { archived, ...rest } = input;
  await prisma.keyword.update({
    where: { id: keyword.id },
    data: { ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) },
  });
}

async function ownKeywordId(ctx: ProjectContext, id: string | null): Promise<string | null> {
  if (!id) return null;
  const keyword = await prisma.keyword.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!keyword) throw notFoundError();
  return keyword.id;
}

async function ownPublicationId(ctx: ProjectContext, id: string | null): Promise<string | null> {
  if (!id) return null;
  const publication = await prisma.publication.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!publication) throw notFoundError();
  return publication.id;
}

// ─── Заявки ───

export async function listLeads(ctx: ProjectContext, status?: string) {
  const parsed = leadStatus.safeParse(status);
  return prisma.lead.findMany({
    where: { projectId: ctx.projectId, ...(parsed.success ? { status: parsed.data } : {}) },
    orderBy: { firstTouchAt: "desc" },
    take: 300,
    include: {
      keyword: { select: { word: true } },
      publication: { select: { id: true, title: true } },
      client: { select: { id: true, name: true } },
    },
  });
}

export type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

export async function leadCounts(ctx: ProjectContext): Promise<Record<string, number>> {
  const rows = await prisma.lead.groupBy({ by: ["status"], where: { projectId: ctx.projectId }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.status, r._count]));
}

const leadInput = z.object({
  handle: z.string().trim().min(1, "Укажите ник или имя").max(100, "Ник — до 100 символов"),
  contact: text(200, "Контакт"),
  source,
  keywordId: optionalId,
  publicationId: optionalId,
  note: text(2000, "Заметка"),
  date: day.nullable().default(null),
});

/** Ручная заявка (директ, Telegram…). Если этот человек уже писал это слово — отказ с понятным сообщением. */
export async function createLead(ctx: ProjectContext, raw: z.input<typeof leadInput>, now = new Date()) {
  assertCan(ctx, "sales.manage");
  const input = parseInput(leadInput, raw);
  const handle = input.source === "COMMENT" || input.source === "DIRECT" ? normalizeHandle(input.handle) : input.handle;
  const [keywordId, publicationId] = await Promise.all([ownKeywordId(ctx, input.keywordId), ownPublicationId(ctx, input.publicationId)]);
  if (keywordId) {
    const existing = await prisma.lead.findFirst({ where: { projectId: ctx.projectId, keywordId, handle }, select: { id: true } });
    if (existing) throw new AppError("CONFLICT", "Эта заявка уже есть: человек уже писал это слово.");
  }
  const created = prisma.lead.create({
    data: {
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      handle,
      contact: input.contact,
      source: input.source,
      keywordId,
      publicationId,
      note: input.note,
      firstTouchAt: input.date ? dayStartInZone(input.date) : now,
    },
    select: { id: true },
  });
  return created.catch((error: unknown) => {
    // Одновременно пришла такая же заявка (например, из комментариев)
    if ((error as { code?: string }).code === "P2002") throw new AppError("CONFLICT", "Эта заявка уже есть: человек уже писал это слово.");
    throw error;
  });
}

export async function updateLead(ctx: ProjectContext, id: string, raw: { status?: string; note?: string; contact?: string }) {
  assertCan(ctx, "sales.manage");
  const input = parseInput(z.object({ status: leadStatus.optional(), note: text(2000, "Заметка").optional(), contact: text(200, "Контакт").optional() }), raw);
  const lead = await prisma.lead.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!lead) throw notFoundError();
  await prisma.lead.update({ where: { id: lead.id }, data: input });
}

export async function deleteLead(ctx: ProjectContext, id: string) {
  assertCan(ctx, "sales.manage");
  const lead = await prisma.lead.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!lead) throw notFoundError();
  await prisma.lead.delete({ where: { id: lead.id } });
}

const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;

/** «Стал клиентом»: карточка клиента из заявки (повторно — та же карточка). */
export async function convertLead(ctx: ProjectContext, id: string) {
  assertCan(ctx, "sales.manage");
  const lead = await prisma.lead.findFirst({ where: { id, projectId: ctx.projectId } });
  if (!lead) throw notFoundError();
  if (lead.clientId) return { id: lead.clientId };
  const contact = lead.contact.trim();
  const isPhone = PHONE_RE.test(contact);
  // Двойной клик не должен создать двух клиентов: привязываем, только если заявка ещё свободна
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
    data: {
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      name: lead.handle,
      instagram: lead.source === "COMMENT" || lead.source === "DIRECT" ? lead.handle : "",
      telegram: lead.source === "TELEGRAM" ? lead.handle : "",
      phone: isPhone ? contact : "",
      notes: contact && !isPhone ? `Контакт: ${contact}` : "",
      source: lead.source,
      keywordId: lead.keywordId,
    },
    select: { id: true },
    });
    const linked = await tx.lead.updateMany({ where: { id: lead.id, clientId: null }, data: { clientId: client.id, status: "CLIENT" } });
    if (linked.count > 0) return client;
    await tx.client.delete({ where: { id: client.id } });
    const current = await tx.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { clientId: true } });
    return { id: current.clientId! };
  });
}

// ─── Клиенты и оплаты ───

export async function listClients(ctx: ProjectContext) {
  const clients = await prisma.client.findMany({
    where: { projectId: ctx.projectId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { keyword: { select: { word: true } }, payments: { select: { amountRub: true, paidAt: true } } },
  });
  return clients.map(({ payments, ...client }) => ({
    ...client,
    paymentsCount: payments.length,
    revenueRub: payments.reduce((sum, p) => sum + p.amountRub, 0),
    lastPaidAt: payments.reduce<Date | null>((last, p) => (!last || p.paidAt > last ? p.paidAt : last), null),
  }));
}

export type ClientListRow = Awaited<ReturnType<typeof listClients>>[number];

export async function getClient(ctx: ProjectContext, id: string) {
  const client = await prisma.client.findFirst({
    where: { id, projectId: ctx.projectId },
    include: {
      keyword: { select: { id: true, word: true } },
      payments: { orderBy: { paidAt: "desc" } },
      leads: { orderBy: { firstTouchAt: "asc" }, include: { keyword: { select: { word: true } }, publication: { select: { title: true } } } },
    },
  });
  if (!client) throw notFoundError();
  return client;
}

export type ClientDetails = Awaited<ReturnType<typeof getClient>>;

const clientInput = z.object({
  name: z.string().trim().min(1, "Укажите имя").max(100, "Имя — до 100 символов"),
  phone: text(30, "Телефон"),
  telegram: text(100, "Telegram"),
  instagram: text(100, "Instagram"),
  email: text(200, "Email"),
  source: source.nullable().default(null),
  keywordId: optionalId,
  notes: text(10000, "Заметки"),
});

export type ClientInput = z.input<typeof clientInput>;

export async function createClient(ctx: ProjectContext, raw: ClientInput) {
  assertCan(ctx, "sales.manage");
  const input = parseInput(clientInput, raw);
  const keywordId = await ownKeywordId(ctx, input.keywordId);
  return prisma.client.create({ data: { ...input, keywordId, workspaceId: ctx.workspaceId, projectId: ctx.projectId }, select: { id: true } });
}

export async function updateClient(ctx: ProjectContext, id: string, raw: ClientInput) {
  assertCan(ctx, "sales.manage");
  const input = parseInput(clientInput, raw);
  const client = await prisma.client.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!client) throw notFoundError();
  const keywordId = await ownKeywordId(ctx, input.keywordId);
  await prisma.client.update({ where: { id: client.id }, data: { ...input, keywordId } });
}

export async function deleteClient(ctx: ProjectContext, id: string) {
  assertCan(ctx, "sales.manage");
  const client = await prisma.client.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!client) throw notFoundError();
  await prisma.client.delete({ where: { id: client.id } });
}

const paymentInput = z.object({
  amountRub: z.number().int("Сумма — целое число рублей").min(1, "Сумма больше нуля").max(100_000_000, "Слишком большая сумма"),
  product: text(200, "Продукт"),
  paidAt: day,
  note: text(1000, "Заметка"),
});

export async function addPayment(ctx: ProjectContext, clientId: string, raw: z.input<typeof paymentInput>) {
  assertCan(ctx, "sales.manage");
  const input = parseInput(paymentInput, raw);
  const client = await prisma.client.findFirst({ where: { id: clientId, projectId: ctx.projectId }, select: { id: true } });
  if (!client) throw notFoundError();
  return prisma.payment.create({
    data: { ...input, paidAt: dayToDate(input.paidAt), clientId: client.id, workspaceId: ctx.workspaceId, projectId: ctx.projectId },
    select: { id: true },
  });
}

export async function deletePayment(ctx: ProjectContext, id: string) {
  assertCan(ctx, "sales.manage");
  const payment = await prisma.payment.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!payment) throw notFoundError();
  await prisma.payment.delete({ where: { id: payment.id } });
}

// ─── Отчёт «кодовые слова → лиды → деньги» ───

type Range = { from: string; to: string } | null;

/** Для полей со временем (касание): дни по часовому поясу плана, последний день включительно. */
const timeRange = (range: Range) => (range ? { gte: dayStartInZone(range.from), lt: dayStartInZone(addDays(range.to, 1)) } : undefined);
/** Для полей-дат (DATE). */
const dateRange = (range: Range) => (range ? { gte: dayToDate(range.from), lte: dayToDate(range.to) } : undefined);

export type KeywordReportRow = {
  id: string;
  word: string;
  product: string;
  archived: boolean;
  posts: number;
  views: number;
  wrote: number;
  per1000: number | null;
  leads: number;
  payments: number;
  revenueRub: number;
};

/**
 * Посты — опубликованное с этим словом; написали — разные люди (комментарии со словом и заявки с ним);
 * лиды — заявки (первое касание в периоде); оплаты и выручка — оплаты в периоде клиентов, пришедших по слову.
 */
export async function keywordReport(ctx: ProjectContext, range: Range): Promise<KeywordReportRow[]> {
  const touched = timeRange(range);
  const dated = dateRange(range);
  const [keywords, publications, mentionPeople, leadPeople, leads, payments] = await Promise.all([
    prisma.keyword.findMany({ where: { projectId: ctx.projectId }, orderBy: { word: "asc" } }),
    prisma.publication.findMany({
      where: { projectId: ctx.projectId, status: "PUBLISHED", codeWord: { not: null }, ...(dated ? { date: dated } : {}) },
      select: { codeWord: true, views: true },
    }),
    prisma.keywordMention.findMany({
      where: { projectId: ctx.projectId, ...(touched ? { at: touched } : {}) },
      distinct: ["keywordId", "handle"],
      select: { keywordId: true, handle: true },
    }),
    prisma.lead.findMany({
      where: { projectId: ctx.projectId, keywordId: { not: null }, ...(touched ? { firstTouchAt: touched } : {}) },
      select: { keywordId: true, handle: true },
    }),
    prisma.lead.groupBy({ by: ["keywordId"], where: { projectId: ctx.projectId, keywordId: { not: null }, ...(touched ? { firstTouchAt: touched } : {}) }, _count: true }),
    prisma.payment.findMany({
      where: { projectId: ctx.projectId, client: { keywordId: { not: null } }, ...(dated ? { paidAt: dated } : {}) },
      select: { amountRub: true, client: { select: { keywordId: true } } },
    }),
  ]);

  const countBy = (rows: { keywordId: string | null; _count: number }[]) => new Map(rows.map((r) => [r.keywordId, r._count]));
  const leadCount = countBy(leads);
  // «Написали» — разные люди: из комментариев и из заявок (директ, Telegram), без двойного счёта
  const people = new Map<string, Set<string>>();
  for (const { keywordId, handle } of [...mentionPeople, ...leadPeople]) {
    if (keywordId) people.set(keywordId, (people.get(keywordId) ?? new Set<string>()).add(handle.toLowerCase()));
  }

  return keywords.map((keyword) => {
    const posts = publications.filter((p) => normalizeWord(p.codeWord ?? "") === keyword.word);
    const views = posts.reduce((sum, p) => sum + (p.views ?? 0), 0);
    const wrote = people.get(keyword.id)?.size ?? 0;
    const own = payments.filter((p) => p.client.keywordId === keyword.id);
    return {
      id: keyword.id,
      word: keyword.word,
      product: keyword.product,
      archived: keyword.archivedAt !== null,
      posts: posts.length,
      views,
      wrote,
      per1000: views > 0 ? (wrote / views) * 1000 : null,
      leads: leadCount.get(keyword.id) ?? 0,
      payments: own.length,
      revenueRub: own.reduce((sum, p) => sum + p.amountRub, 0),
    };
  });
}

/** Для плиток статистики: заявки, оплаты и выручка за период. */
export async function moneySummary(ctx: ProjectContext, range: Range) {
  const touched = timeRange(range);
  const dated = dateRange(range);
  const [leads, payments] = await Promise.all([
    prisma.lead.count({ where: { projectId: ctx.projectId, ...(touched ? { firstTouchAt: touched } : {}) } }),
    prisma.payment.aggregate({ where: { projectId: ctx.projectId, ...(dated ? { paidAt: dated } : {}) }, _count: true, _sum: { amountRub: true } }),
  ]);
  return { leads, payments: payments._count, revenueRub: payments._sum.amountRub ?? 0 };
}

export type MoneySummary = Awaited<ReturnType<typeof moneySummary>>;

/** Опубликованное — для выбора источника заявки. */
export async function publicationOptions(ctx: ProjectContext) {
  return prisma.publication.findMany({
    where: { projectId: ctx.projectId, status: "PUBLISHED" },
    orderBy: { date: "desc" },
    take: 100,
    select: { id: true, title: true, date: true },
  });
}
