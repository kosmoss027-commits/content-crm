// Запуск сбора. Сам сбор идёт у провайдера; результат забирает ingest.ts (по webhook или опросу).
import type { ScrapeRunKind } from "@/lib/generated/prisma/enums";
import { APIFY_PRICES, EXPECTED_REELS_PER_DAY, INITIAL_REELS_PER_ACCOUNT, SCRAPE_SCHEDULE } from "@/config/scraping";
import { prisma } from "@/lib/db/prisma";
import { siteUrl } from "@/lib/supabase/env";
import { scraper, type ScraperProvider } from "@/scraper";
import { availableForRun } from "@/lib/research/budget";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Меньше этой суммы запуск не имеет смысла: Apify не соберёт даже несколько роликов */
const MIN_RUN_USD = 0.02;

export type CollectRequest = {
  kind: ScrapeRunKind;
  usernames: string[];
  workspaceId?: string;
  projectId?: string;
};

export type CollectOutcome = { status: "started" | "skipped" | "failed"; message: string };

export function estimateUsd(kind: ScrapeRunKind, accounts: number): number {
  const perAccount =
    kind === "PROFILE"
      ? APIFY_PRICES.profile
      : kind === "INITIAL"
        ? INITIAL_REELS_PER_ACCOUNT * APIFY_PRICES.reel
        : (SCRAPE_SCHEDULE.windowDays * EXPECTED_REELS_PER_DAY + 2) * APIFY_PRICES.reel;
  return Math.round(accounts * perAccount * 1000) / 1000;
}

/** Адрес, по которому провайдер сообщит о готовности. Локально его нет — там работает опрос. */
function webhookUrl(): string | undefined {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  const base = siteUrl();
  if (!secret || base.includes("localhost")) return undefined;
  return `${base}/api/webhooks/apify?secret=${encodeURIComponent(secret)}`;
}

export async function startCollection(
  request: CollectRequest,
  provider: ScraperProvider = scraper,
  now = new Date(),
): Promise<CollectOutcome> {
  const usernames = [...new Set(request.usernames)];
  if (usernames.length === 0) return { status: "skipped", message: "Нет аккаунтов для сбора." };

  const estimatedUsd = estimateUsd(request.kind, usernames.length);
  const base = {
    kind: request.kind,
    usernames,
    estimatedUsd,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
  };

  const maxCostUsd = await availableForRun(now);
  if (maxCostUsd < MIN_RUN_USD) {
    const message = "Достигнут месячный лимит расходов на сбор. Сбор не запущен.";
    await prisma.scrapeRun.create({ data: { ...base, status: "SKIPPED", error: message, finishedAt: now } });
    return { status: "skipped", message };
  }

  try {
    const hook = webhookUrl();
    const apifyRunId =
      request.kind === "PROFILE"
        ? await provider.startProfiles({ usernames, maxCostUsd, webhookUrl: hook })
        : await provider.startReels({
            usernames,
            maxCostUsd,
            webhookUrl: hook,
            ...(request.kind === "INITIAL"
              ? { limitPerAccount: INITIAL_REELS_PER_ACCOUNT }
              : { newerThan: new Date(now.getTime() - SCRAPE_SCHEDULE.windowDays * DAY_MS) }),
          });
    await prisma.scrapeRun.create({ data: { ...base, status: "RUNNING", apifyRunId } });
    return { status: "started", message: `Сбор запущен: ${usernames.length} акк., оценка ~$${estimatedUsd.toFixed(2)}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Не удалось запустить сбор:", message);
    await prisma.scrapeRun.create({ data: { ...base, status: "FAILED", error: message.slice(0, 500), finishedAt: now } });
    return { status: "failed", message: "Не удалось запустить сбор. Подробности в журнале сбора." };
  }
}
