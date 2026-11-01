// Сбор роликов с поддельным провайдером: лимиты, приём результатов, изоляция ленты между проектами.
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { SCRAPE_BUDGET } from "@/config/scraping";
import { prisma } from "@/lib/db/prisma";
import { getProjectContext } from "@/lib/db/access";
import { AppError } from "@/lib/db/errors";
import { listRadar, listRunsForProject, listViralFeed, toggleReelMark } from "@/lib/db/reels";
import { addAccounts, listWatchlist, removeEntry } from "@/lib/db/watchlist";
import { startCollection } from "@/lib/research/collect";
import { isScheduledCollectionDue } from "@/lib/research/cron";
import { syncPendingRuns } from "@/lib/research/ingest";
import { secretMatches } from "@/lib/secrets";
import type { RunResult, ScrapedReelData, ScraperProvider } from "@/scraper";
import { createUser, createWorkspace, resetDatabase } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const expectCode = (code: AppError["code"]) => expect.objectContaining({ name: "AppError", code });

function reel(username: string, shortCode: string, views: number, daysAgo: number): ScrapedReelData {
  return {
    shortCode,
    username,
    url: `https://www.instagram.com/reel/${shortCode}/`,
    postedAt: new Date(Date.now() - daysAgo * DAY),
    caption: null,
    views,
    likes: null,
    comments: null,
    durationSec: 30,
    videoUrl: null,
    coverUrl: null,
    musicTitle: null,
    musicArtist: null,
    hashtags: [],
    isPinned: false,
    fullName: null,
  };
}

/** Поддельный провайдер: запоминает запросы и отдаёт заранее заданный результат. */
function fakeProvider(result: RunResult, costUsd = 0.1) {
  const started: { kind: string; usernames: string[]; maxCostUsd: number }[] = [];
  const provider: ScraperProvider = {
    async startReels(request) {
      started.push({ kind: "reels", usernames: request.usernames, maxCostUsd: request.maxCostUsd });
      return `run-${randomUUID()}`;
    },
    async startProfiles(request) {
      started.push({ kind: "profiles", usernames: request.usernames, maxCostUsd: request.maxCostUsd });
      return `run-${randomUUID()}`;
    },
    async getRunState() {
      return { status: "succeeded", costUsd, error: null };
    },
    async getRunResult() {
      return result;
    },
  };
  return { provider, started };
}

/** У аккаунта 12 обычных роликов по 1000 просмотров и один залёт. */
function accountReels(username: string, viralViews: number, viralDaysAgo = 1): ScrapedReelData[] {
  return [
    ...Array.from({ length: 12 }, (_, i) => reel(username, `${username}-${i}`, 1000, 5 + i)),
    reel(username, `${username}-viral`, viralViews, viralDaysAgo),
  ];
}

async function setup() {
  const alice = await createUser("alice@test.ru");
  const bob = await createUser("bob@test.ru");
  const wsA = await createWorkspace(alice, ["Проект Алисы"]);
  const wsB = await createWorkspace(bob, ["Проект Боба"]);
  const ctxA = await getProjectContext(alice.id, wsA.projects[0].id);
  const ctxB = await getProjectContext(bob.id, wsB.projects[0].id);
  return { ctxA, ctxB };
}

describe("разведка: лента и изоляция", () => {
  beforeEach(resetDatabase);

  it("проект видит залёты только своих аккаунтов, хотя ролики лежат в общем банке", async () => {
    const { ctxA, ctxB } = await setup();
    await addAccounts(ctxA, "alpha", "CIS");
    await addAccounts(ctxB, "beta", "FOREIGN");

    const { provider } = fakeProvider({ reels: [...accountReels("alpha", 5000), ...accountReels("beta", 50000)], profiles: [], failures: [] });
    await startCollection({ kind: "INITIAL", usernames: ["alpha", "beta"] }, provider);
    await syncPendingRuns(provider);

    const feedA = await listViralFeed(ctxA, {});
    expect(feedA.map((r) => r.shortCode)).toEqual(["alpha-viral"]);
    expect(feedA[0].multiplier).toBe(5);

    const radarA = await listRadar(ctxA, 72);
    expect(radarA).toHaveLength(0); // ×5 ниже порога аномалии ×10
    const radarB = await listRadar(ctxB, 72);
    expect(radarB.map((r) => r.shortCode)).toEqual(["beta-viral"]);
  });

  it("один аккаунт в двух проектах собирается один раз", async () => {
    const { ctxA, ctxB } = await setup();
    await addAccounts(ctxA, "shared", "CIS");
    const second = await addAccounts(ctxB, "@Shared", "CIS");
    expect(second.added).toEqual(["shared"]);
    expect(await prisma.scrapedAccount.count()).toBe(1);
  });

  it("нельзя отметить или удалить чужое", async () => {
    const { ctxA, ctxB } = await setup();
    await addAccounts(ctxB, "beta", "CIS");
    const { provider } = fakeProvider({ reels: accountReels("beta", 50000), profiles: [], failures: [] });
    await startCollection({ kind: "INITIAL", usernames: ["beta"] }, provider);
    await syncPendingRuns(provider);

    const betaReel = await prisma.scrapedReel.findFirstOrThrow({ where: { shortCode: "beta-viral" } });
    await expect(toggleReelMark(ctxA, betaReel.id)).rejects.toEqual(expectCode("NOT_FOUND"));

    const [entryB] = await listWatchlist(ctxB);
    await expect(removeEntry(ctxA, entryB.id)).rejects.toEqual(expectCode("NOT_FOUND"));
  });

  it("журнал проекта не раскрывает ники других проектов", async () => {
    const { ctxA, ctxB } = await setup();
    await addAccounts(ctxA, "alpha", "CIS");
    await addAccounts(ctxB, "secret_competitor", "CIS");
    const { provider } = fakeProvider({ reels: [], profiles: [], failures: [] });
    await startCollection({ kind: "SCHEDULED", usernames: ["alpha", "secret_competitor"] }, provider);

    const runs = await listRunsForProject(ctxA);
    expect(runs).toHaveLength(1);
    expect(runs[0].accounts).toEqual(["alpha"]);
  });

  it("SMM может добавлять аккаунты, менеджер — нет", async () => {
    const owner = await createUser("o@test.ru");
    const smm = await createUser("s@test.ru");
    const manager = await createUser("m@test.ru");
    const ws = await createWorkspace(owner, ["П"], [
      { userId: smm.id, role: "SMM" },
      { userId: manager.id, role: "MANAGER" },
    ]);
    const smmCtx = await getProjectContext(smm.id, ws.projects[0].id);
    const managerCtx = await getProjectContext(manager.id, ws.projects[0].id);
    await expect(addAccounts(smmCtx, "alpha", "CIS")).resolves.toMatchObject({ added: ["alpha"] });
    await expect(addAccounts(managerCtx, "beta", "CIS")).rejects.toEqual(expectCode("FORBIDDEN"));
  });
});

describe("разведка: сбор и лимиты", () => {
  beforeEach(resetDatabase);

  it("ошибки аккаунтов сохраняются, медиана и залёты пересчитываются", async () => {
    const { ctxA } = await setup();
    await addAccounts(ctxA, "alpha al_shanin", "CIS");
    const { provider } = fakeProvider({
      reels: accountReels("alpha", 4000),
      profiles: [],
      failures: [{ username: "al_shanin", reason: "Restricted profile" }],
    });
    await startCollection({ kind: "INITIAL", usernames: ["alpha", "al_shanin"] }, provider);
    await syncPendingRuns(provider);

    const alpha = await prisma.scrapedAccount.findUniqueOrThrow({ where: { username: "alpha" } });
    expect(alpha).toMatchObject({ medianViews: 1000, reelsCount: 13, viralCount: 1, lastError: null });
    const shanin = await prisma.scrapedAccount.findUniqueOrThrow({ where: { username: "al_shanin" } });
    expect(shanin.lastError).toBe("Restricted profile");

    const run = await prisma.scrapeRun.findFirstOrThrow();
    expect(run).toMatchObject({ status: "SUCCEEDED", costUsd: 0.1, itemsCount: 13 });
  });

  it("повторный сбор обновляет просмотры, а не дублирует ролики", async () => {
    await setup();
    const first = fakeProvider({ reels: [reel("alpha", "r1", 100, 1)], profiles: [], failures: [] });
    await startCollection({ kind: "MANUAL", usernames: ["alpha"] }, first.provider);
    await syncPendingRuns(first.provider);
    const second = fakeProvider({ reels: [reel("alpha", "r1", 900, 1)], profiles: [], failures: [] });
    await startCollection({ kind: "MANUAL", usernames: ["alpha"] }, second.provider);
    await syncPendingRuns(second.provider);

    const reels = await prisma.scrapedReel.findMany();
    expect(reels).toHaveLength(1);
    expect(reels[0].views).toBe(900);
  });

  it("при исчерпанном месячном лимите сбор не запускается", async () => {
    await prisma.scrapeRun.create({
      data: { kind: "SCHEDULED", status: "SUCCEEDED", usernames: ["x"], costUsd: SCRAPE_BUDGET.monthlyUsd },
    });
    const { provider, started } = fakeProvider({ reels: [], profiles: [], failures: [] });
    const outcome = await startCollection({ kind: "MANUAL", usernames: ["alpha"] }, provider);

    expect(outcome.status).toBe("skipped");
    expect(started).toHaveLength(0);
    expect(await prisma.scrapeRun.count({ where: { status: "SKIPPED" } })).toBe(1);
  });

  it("запуск ограничен остатком месячного лимита", async () => {
    await prisma.scrapeRun.create({
      data: { kind: "SCHEDULED", status: "SUCCEEDED", usernames: ["x"], costUsd: SCRAPE_BUDGET.monthlyUsd - 0.5 },
    });
    const { provider, started } = fakeProvider({ reels: [], profiles: [], failures: [] });
    await startCollection({ kind: "MANUAL", usernames: ["alpha"] }, provider);
    expect(started[0].maxCostUsd).toBe(0.5);
  });
});

describe("расписание и секреты", () => {
  it("сбор раз в 3 дня не раньше 8:00 по Алматы", () => {
    const morning = new Date("2026-11-01T03:30:00Z"); // 08:30 в Алматы (UTC+5)
    const night = new Date("2026-11-01T01:00:00Z"); // 06:00
    expect(isScheduledCollectionDue(night, null)).toBe(false);
    expect(isScheduledCollectionDue(morning, null)).toBe(true);
    expect(isScheduledCollectionDue(morning, new Date(morning.getTime() - 1 * DAY))).toBe(false);
    expect(isScheduledCollectionDue(morning, new Date(morning.getTime() - 3 * DAY + 60 * 60 * 1000))).toBe(true);
  });

  it("webhook и cron без правильного секрета не принимаются", () => {
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abd", "abc")).toBe(false);
    expect(secretMatches(null, "abc")).toBe(false);
    expect(secretMatches("abc", undefined)).toBe(false);
  });
});
