// Аккаунты разведки конкретного проекта. Каждый запрос ограничен ctx.projectId.
import { z } from "zod";
import type { Market, WatchStatus } from "@/lib/generated/prisma/enums";
import { getPlan } from "@/config/plans";
import { prisma } from "@/lib/db/prisma";
import { AppError, notFoundError } from "@/lib/db/errors";
import { assertCan, type ProjectContext } from "@/lib/db/access";
import { parseUsernames } from "@/lib/research/usernames";
import { parseInput } from "@/lib/validation";

export async function listWatchlist(ctx: ProjectContext) {
  return prisma.watchlistEntry.findMany({
    where: { projectId: ctx.projectId },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: { account: true },
  });
}

export type AddAccountsResult = {
  added: string[];
  alreadyWatched: string[];
  invalid: string[];
  /** Аккаунты, которые ещё ни разу не собирались: по ним нужен первый сбор */
  needInitial: string[];
};

export async function addAccounts(ctx: ProjectContext, input: string, market: Market): Promise<AddAccountsResult> {
  assertCan(ctx, "research.manage");
  const { valid, invalid } = parseUsernames(input);
  if (valid.length === 0) throw new AppError("VALIDATION", "Не нашёл ни одного ника. Вставьте ники или ссылки на профили.");

  const existing = await prisma.watchlistEntry.findMany({
    where: { projectId: ctx.projectId, account: { username: { in: valid } } },
    select: { account: { select: { username: true } } },
  });
  const alreadyWatched = new Set(existing.map((e) => e.account.username));
  const toAdd = valid.filter((u) => !alreadyWatched.has(u));

  const limit = getPlan(ctx.workspace.plan).watchedAccounts;
  if (limit !== null) {
    const count = await prisma.watchlistEntry.count({ where: { projectId: ctx.projectId } });
    if (count + toAdd.length > limit) {
      throw new AppError("LIMIT", `В разведке проекта может быть не больше ${limit} аккаунтов. Сейчас ${count}.`);
    }
  }

  await prisma.scrapedAccount.createMany({ data: toAdd.map((username) => ({ username })), skipDuplicates: true });
  const accounts = await prisma.scrapedAccount.findMany({
    where: { username: { in: toAdd } },
    select: { id: true, username: true, lastScrapedAt: true },
  });
  await prisma.watchlistEntry.createMany({
    data: accounts.map((a) => ({ workspaceId: ctx.workspaceId, projectId: ctx.projectId, accountId: a.id, market })),
    skipDuplicates: true,
  });

  return {
    added: toAdd,
    alreadyWatched: [...alreadyWatched],
    invalid,
    needInitial: accounts.filter((a) => a.lastScrapedAt === null).map((a) => a.username),
  };
}

async function findEntry(ctx: ProjectContext, entryId: string) {
  const entry = await prisma.watchlistEntry.findFirst({
    where: { id: entryId, projectId: ctx.projectId },
    include: { account: { select: { username: true, lastScrapedAt: true } } },
  });
  if (!entry) throw notFoundError();
  return entry;
}

const entryUpdate = z.object({
  status: z.enum(["WATCHING", "PAUSED", "CANDIDATE"]).optional(),
  market: z.enum(["CIS", "FOREIGN"]).optional(),
  niche: z.string().trim().max(40, "Ниша — не длиннее 40 символов").nullable().optional(),
});

export async function updateEntry(
  ctx: ProjectContext,
  entryId: string,
  input: { status?: WatchStatus; market?: Market; niche?: string | null },
) {
  assertCan(ctx, "research.manage");
  const data = parseInput(entryUpdate, input);
  const entry = await findEntry(ctx, entryId);
  await prisma.watchlistEntry.update({
    where: { id: entry.id },
    data: { ...data, niche: data.niche === "" ? null : data.niche },
  });
}

export async function removeEntry(ctx: ProjectContext, entryId: string) {
  assertCan(ctx, "research.manage");
  const entry = await findEntry(ctx, entryId);
  await prisma.watchlistEntry.delete({ where: { id: entry.id } });
}

/** Ники для кнопки «Собрать сейчас»: один аккаунт проекта или все отслеживаемые. */
export async function usernamesForManualCollect(ctx: ProjectContext, entryId?: string) {
  assertCan(ctx, "research.manage");
  if (entryId) {
    const entry = await findEntry(ctx, entryId);
    return { usernames: [entry.account.username], initial: entry.account.lastScrapedAt === null };
  }
  const entries = await prisma.watchlistEntry.findMany({
    where: { projectId: ctx.projectId, status: "WATCHING" },
    select: { account: { select: { username: true } } },
  });
  return { usernames: entries.map((e) => e.account.username), initial: false };
}

export async function listProjectNiches(ctx: ProjectContext): Promise<string[]> {
  const rows = await prisma.watchlistEntry.findMany({
    where: { projectId: ctx.projectId, niche: { not: null } },
    distinct: ["niche"],
    select: { niche: true },
  });
  return rows.map((r) => r.niche!).sort();
}

/** Все отслеживаемые аккаунты проекта для кнопки «Собрать и разобрать»: новые (ещё ни разу не собирались) отдельно. */
export async function watchedForCollectAll(ctx: ProjectContext): Promise<{ fresh: string[]; known: string[] }> {
  assertCan(ctx, "research.manage");
  const entries = await prisma.watchlistEntry.findMany({
    where: { projectId: ctx.projectId, status: "WATCHING" },
    select: { account: { select: { username: true, lastScrapedAt: true } } },
  });
  return {
    fresh: entries.filter((e) => e.account.lastScrapedAt === null).map((e) => e.account.username),
    known: entries.filter((e) => e.account.lastScrapedAt !== null).map((e) => e.account.username),
  };
}
