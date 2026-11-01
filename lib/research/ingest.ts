// Приём результатов сбора: сохраняем ролики и профили, пересчитываем медиану и множители.
import type { ScrapeRun } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { scraper, type RunResult, type ScraperProvider } from "@/scraper";
import { computeAccountStats } from "@/lib/research/metrics";

async function accountIdsByUsername(usernames: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(usernames)];
  await prisma.scrapedAccount.createMany({ data: unique.map((username) => ({ username })), skipDuplicates: true });
  const accounts = await prisma.scrapedAccount.findMany({ where: { username: { in: unique } }, select: { id: true, username: true } });
  return new Map(accounts.map((a) => [a.username, a.id]));
}

async function saveReels(result: RunResult, ids: Map<string, string>, now: Date): Promise<void> {
  const writes = result.reels.flatMap((reel) => {
    const accountId = ids.get(reel.username);
    if (!accountId) return [];
    const fresh = {
      views: reel.views,
      likes: reel.likes,
      comments: reel.comments,
      videoUrl: reel.videoUrl,
      coverUrl: reel.coverUrl,
      caption: reel.caption,
      isPinned: reel.isPinned,
      viewsUpdatedAt: now,
    };
    return [
      prisma.scrapedReel.upsert({
        where: { shortCode: reel.shortCode },
        update: fresh,
        create: {
          ...fresh,
          shortCode: reel.shortCode,
          accountId,
          url: reel.url,
          postedAt: reel.postedAt,
          durationSec: reel.durationSec,
          musicTitle: reel.musicTitle,
          musicArtist: reel.musicArtist,
          hashtags: reel.hashtags,
        },
      }),
    ];
  });
  for (let i = 0; i < writes.length; i += 50) await prisma.$transaction(writes.slice(i, i + 50));

  const names = new Map(result.reels.filter((r) => r.fullName).map((r) => [r.username, r.fullName!]));
  for (const [username, fullName] of names) {
    await prisma.scrapedAccount.updateMany({ where: { username, fullName: null }, data: { fullName } });
  }
}

async function saveProfiles(result: RunResult, now: Date): Promise<void> {
  for (const profile of result.profiles) {
    await prisma.scrapedAccount.updateMany({
      where: { username: profile.username },
      data: { fullName: profile.fullName, avatarUrl: profile.avatarUrl, followers: profile.followers, lastProfileAt: now },
    });
  }
}

/** Пересчёт медианы, залётов, рейтинга аккаунта и множителей его роликов. */
export async function recomputeAccount(accountId: string, now = new Date()): Promise<void> {
  const reels = await prisma.scrapedReel.findMany({ where: { accountId }, select: { id: true, views: true, postedAt: true } });
  const stats = computeAccountStats(reels, now);
  const reelUpdates = reels.map((reel) =>
    prisma.scrapedReel.update({ where: { id: reel.id }, data: { multiplier: stats.multipliers.get(reel.id) ?? null } }),
  );
  for (let i = 0; i < reelUpdates.length; i += 50) await prisma.$transaction(reelUpdates.slice(i, i + 50));
  await prisma.scrapedAccount.update({
    where: { id: accountId },
    data: {
      medianViews: stats.medianViews,
      reelsCount: stats.reelsCount,
      viralCount: stats.viralCount,
      avgViralMultiplier: stats.avgViralMultiplier,
      rating: stats.rating,
    },
  });
}

/** Проверяет запуск у провайдера и, если он закончился, забирает результат. Повторный вызов безопасен. */
export async function syncRun(run: ScrapeRun, provider: ScraperProvider = scraper, now = new Date()): Promise<boolean> {
  if (run.status !== "RUNNING" || !run.apifyRunId) return false;
  const state = await provider.getRunState(run.apifyRunId);
  if (state.status === "running") return false;

  const kind = run.kind === "PROFILE" ? "profiles" : "reels";
  const fetched = await provider.getRunResult(run.apifyRunId, kind);
  // Совместные ролики приходят с владельцем-соавтором: сохраняем только ролики запрошенных аккаунтов.
  const requested = new Set(run.usernames);
  const result = { ...fetched, reels: fetched.reels.filter((reel) => requested.has(reel.username)) };
  const ids = await accountIdsByUsername(run.usernames);

  if (kind === "reels") await saveReels(result, ids, now);
  else await saveProfiles(result, now);

  const failed = new Map(result.failures.map((f) => [f.username, f.reason]));
  for (const username of run.usernames) {
    await prisma.scrapedAccount.updateMany({
      where: { username },
      data: kind === "reels" ? { lastScrapedAt: now, lastError: failed.get(username) ?? null } : { lastError: failed.get(username) ?? undefined },
    });
  }
  if (kind === "reels") {
    for (const accountId of new Set(ids.values())) await recomputeAccount(accountId, now);
  }

  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: {
      status: state.status === "succeeded" ? "SUCCEEDED" : "FAILED",
      costUsd: state.costUsd,
      itemsCount: kind === "reels" ? result.reels.length : result.profiles.length,
      failedAccounts: result.failures.map((f) => `${f.username}: ${f.reason}`),
      error: state.error,
      finishedAt: now,
    },
  });
  return true;
}

/** Забирает результаты всех незавершённых запусков. Ошибка одного не мешает остальным. */
export async function syncPendingRuns(provider: ScraperProvider = scraper): Promise<number> {
  const runs = await prisma.scrapeRun.findMany({ where: { status: "RUNNING" }, orderBy: { startedAt: "asc" } });
  let finished = 0;
  for (const run of runs) {
    try {
      if (await syncRun(run, provider)) finished += 1;
    } catch (error) {
      console.error(`Не удалось забрать результат сбора ${run.id}:`, error);
    }
  }
  return finished;
}
