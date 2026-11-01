// Плановые задачи разведки. Вызывается раз в час (GitHub Actions → /api/cron) и сам решает, пора ли собирать.
import { SCRAPE_SCHEDULE } from "@/config/scraping";
import { prisma } from "@/lib/db/prisma";
import { scraper, type ScraperProvider } from "@/scraper";
import { startCollection } from "@/lib/research/collect";
import { syncPendingRuns } from "@/lib/research/ingest";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Запас, чтобы сбор раз в N дней не «уезжал» на час вперёд каждый раз */
const SCHEDULE_SLACK_MS = 3 * 60 * 60 * 1000;

export function localHour(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(hour);
}

export function isScheduledCollectionDue(now: Date, lastScheduledAt: Date | null): boolean {
  if (localHour(now, SCRAPE_SCHEDULE.timeZone) < SCRAPE_SCHEDULE.hour) return false;
  if (!lastScheduledAt) return true;
  return now.getTime() - lastScheduledAt.getTime() >= SCRAPE_SCHEDULE.everyDays * DAY_MS - SCHEDULE_SLACK_MS;
}

/** Аккаунты, которые хоть один проект отслеживает (не на паузе и не кандидат). */
async function watchedUsernames(): Promise<string[]> {
  const accounts = await prisma.scrapedAccount.findMany({
    where: { watches: { some: { status: "WATCHING", project: { archivedAt: null } } } },
    select: { username: true },
  });
  return accounts.map((a) => a.username);
}

export type CronReport = { finishedRuns: number; scheduled: string | null; profiles: string | null };

export async function runCron(now = new Date(), provider: ScraperProvider = scraper): Promise<CronReport> {
  const finishedRuns = await syncPendingRuns(provider);
  const report: CronReport = { finishedRuns, scheduled: null, profiles: null };

  const lastScheduled = await prisma.scrapeRun.findFirst({
    where: { kind: "SCHEDULED", status: { in: ["RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"] } },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  if (isScheduledCollectionDue(now, lastScheduled?.startedAt ?? null)) {
    const outcome = await startCollection({ kind: "SCHEDULED", usernames: await watchedUsernames() }, provider, now);
    report.scheduled = outcome.message;
  }

  const staleProfiles = await prisma.scrapedAccount.findMany({
    where: {
      watches: { some: { status: "WATCHING" } },
      OR: [{ lastProfileAt: null }, { lastProfileAt: { lt: new Date(now.getTime() - SCRAPE_SCHEDULE.profileEveryDays * DAY_MS) } }],
    },
    select: { username: true },
  });
  const profileRunning = await prisma.scrapeRun.count({ where: { kind: "PROFILE", status: "RUNNING" } });
  if (staleProfiles.length > 0 && profileRunning === 0) {
    const outcome = await startCollection(
      { kind: "PROFILE", usernames: staleProfiles.map((a) => a.username) },
      provider,
      now,
    );
    report.profiles = outcome.message;
  }

  return report;
}
