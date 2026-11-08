// Конвейер разбора: залёты → очередь → проверка на пользу → разбор → утренние черновики сценариев.
// Запускается из /api/cron раз в час; внешние сервисы приходят параметром (в тестах — поддельные).
import type Anthropic from "@anthropic-ai/sdk";
import { AI_LIMITS, AI_MODELS, DAILY_DRAFTS_HOUR } from "@/config/ai";
import { APIFY_PRICES, SCRAPE_SCHEDULE } from "@/config/scraping";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/db/errors";
import { localHour } from "@/lib/research/cron";
import { availableForRun } from "@/lib/research/budget";
import { analysisSchema, analysisSystem, brandContext, relevanceSchema, relevanceSystem } from "@/lib/ai/prompts";
import { generateScript } from "@/lib/ai/scripts";
import type { AiServices } from "@/lib/ai/types";
import { assertAiBudget, claudeCostUsd, recordUsage, transcriptCostUsd } from "@/lib/ai/usage";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ссылка Instagram на видео живёт несколько дней: старше — обновляем перед разбором */
const STALE_VIDEO_MS = 2 * DAY_MS;
const MIN_REFRESH_USD = 0.02;

/** Начало текущих суток в часовом поясе расписания. */
export function localDayStart(now: Date, timeZone = SCRAPE_SCHEDULE.timeZone): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const localAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
}

/** Новые залёты каждого проекта ставятся в очередь разбора. */
export async function enqueueVirals(now = new Date()): Promise<number> {
  const projects = await prisma.project.findMany({
    where: { archivedAt: null, watchlist: { some: { status: "WATCHING" } } },
    select: { id: true, workspaceId: true, viralThreshold: true },
  });
  let queued = 0;
  for (const project of projects) {
    const reels = await prisma.scrapedReel.findMany({
      where: {
        multiplier: { gte: project.viralThreshold },
        postedAt: { gte: new Date(now.getTime() - AI_LIMITS.queueMaxAgeDays * DAY_MS) },
        account: { watches: { some: { projectId: project.id, status: { not: "CANDIDATE" } } } },
        analyses: { none: { projectId: project.id } },
      },
      select: { id: true },
    });
    const { count } = await prisma.reelAnalysis.createMany({
      data: reels.map((r) => ({ workspaceId: project.workspaceId, projectId: project.id, reelId: r.id })),
      skipDuplicates: true,
    });
    queued += count;
  }
  return queued;
}

/** Расшифровка и кадры: делаются один раз на ролик для всех проектов. */
async function ensureMedia(reelId: string, services: AiServices) {
  const existing = await prisma.reelMedia.findUnique({ where: { reelId } });
  if (existing && !existing.error) return existing;
  // Прошлая попытка не удалась (например, устарела ссылка) — пробуем ещё раз
  if (existing) await prisma.reelMedia.delete({ where: { id: existing.id } });
  const reel = await prisma.scrapedReel.findUniqueOrThrow({ where: { id: reelId }, select: { videoUrl: true, durationSec: true } });
  if (!reel.videoUrl) {
    return prisma.reelMedia.create({ data: { reelId, error: "Нет ссылки на видео — разбор только по подписи." } });
  }
  try {
    const media = await services.media.process(reel.videoUrl, reel.durationSec);
    if (media.audioSeconds > 0) {
      await recordUsage({ kind: "TRANSCRIPT", model: "deepgram-nova-3", costUsd: transcriptCostUsd(media.audioSeconds) });
    }
    return prisma.reelMedia.create({ data: { reelId, transcript: media.transcript, frames: media.frames } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return prisma.reelMedia.create({ data: { reelId, error: message.slice(0, 300) } });
  }
}

/** Свежие ссылки на видео для роликов из очереди, у которых нет кадров, а данные старше 2 дней. */
async function refreshStaleVideos(analysisIds: string[], services: AiServices, now: Date): Promise<void> {
  if (!services.scraper || analysisIds.length === 0) return;
  const reels = await prisma.scrapedReel.findMany({
    where: {
      analyses: { some: { id: { in: analysisIds } } },
      viewsUpdatedAt: { lt: new Date(now.getTime() - STALE_VIDEO_MS) },
      OR: [{ media: null }, { media: { error: { not: null } } }],
    },
    select: { url: true },
  });
  if (reels.length === 0) return;
  const maxCostUsd = await availableForRun(now);
  if (maxCostUsd < MIN_REFRESH_USD) return;
  try {
    const fresh = await services.scraper.fetchReelsByUrl(reels.map((r) => r.url), maxCostUsd);
    for (const reel of fresh) {
      await prisma.scrapedReel.updateMany({
        where: { shortCode: reel.shortCode },
        data: { videoUrl: reel.videoUrl, coverUrl: reel.coverUrl, viewsUpdatedAt: now },
      });
    }
    const costUsd = Math.round((fresh.length * APIFY_PRICES.reel + 0.001) * 10000) / 10000;
    await prisma.scrapeRun.create({
      data: { kind: "MANUAL", status: "SUCCEEDED", usernames: [], itemsCount: fresh.length, estimatedUsd: costUsd, costUsd, finishedAt: now },
    });
  } catch (error) {
    console.error("Не удалось обновить ссылки на видео:", error);
  }
}

function reelText(reel: { caption: string | null; views: number; multiplier: number | null; durationSec: number | null; account: { username: string; medianViews: number | null } }, transcript: string | null): string {
  return [
    `Автор: @${reel.account.username}`,
    `Просмотры: ${reel.views} (медиана автора ${reel.account.medianViews ?? "—"}, множитель ×${reel.multiplier ?? "—"})`,
    `Длительность: ${reel.durationSec ? Math.round(reel.durationSec) + " с" : "—"}`,
    `Подпись: ${reel.caption?.trim() || "(нет)"}`,
    `Расшифровка речи: ${transcript?.trim() || "(нет речи или не удалось распознать)"}`,
  ].join("\n");
}

function frameBlocks(frames: string[]): Anthropic.Beta.BetaContentBlockParam[] {
  return frames.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }));
}

/** Разбор одного ролика под проект. Лимит расходов — ошибка LIMIT, остальные ошибки — статус FAILED. */
export async function analyzeOne(analysisId: string, services: AiServices): Promise<"ANALYZED" | "FILTERED" | "FAILED"> {
  const analysis = await prisma.reelAnalysis.findUniqueOrThrow({
    where: { id: analysisId },
    include: {
      reel: { include: { account: { select: { username: true, medianViews: true } } } },
      project: { select: { name: true, brandMap: true } },
    },
  });
  const ids = { workspaceId: analysis.workspaceId, projectId: analysis.projectId };
  const brand = brandContext(analysis.project.brandMap, analysis.project.name);
  const threshold = analysis.project.brandMap?.relevanceThreshold ?? 6;

  try {
    await assertAiBudget();
    const media = await ensureMedia(analysis.reelId, services);
    const text = reelText(analysis.reel, media.transcript);

    if (!analysis.priority) {
      const relevance = await services.llm.generate({
        kind: "RELEVANCE",
        model: AI_MODELS.relevance,
        system: relevanceSystem(brand),
        // Первые кадры — чтобы оценивать и ролики без речи и подписи
        content: [...frameBlocks(media.frames.slice(0, 2)), { type: "text", text }],
        schema: relevanceSchema,
        effort: "low",
        maxTokens: 1024,
      });
      const cost = claudeCostUsd(AI_MODELS.relevance, relevance.usage);
      await recordUsage({ ...ids, kind: "RELEVANCE", model: AI_MODELS.relevance, costUsd: cost, ...relevance.usage });
      await prisma.reelAnalysis.update({
        where: { id: analysisId },
        data: { relevance: relevance.data.score, relevanceReason: relevance.data.reason, costUsd: { increment: cost } },
      });
      if (relevance.data.score < threshold) {
        await prisma.reelAnalysis.update({ where: { id: analysisId }, data: { status: "FILTERED", analyzedAt: new Date() } });
        return "FILTERED";
      }
    }

    await assertAiBudget();
    const images = frameBlocks(media.frames);
    const result = await services.llm.generate({
      kind: "ANALYSIS",
      model: AI_MODELS.analysis,
      system: analysisSystem(brand),
      content: [...images, { type: "text", text: `${text}\n\nРазбери ролик.` }],
      schema: analysisSchema,
      effort: "medium",
      maxTokens: 16000,
    });
    const cost = claudeCostUsd(AI_MODELS.analysis, result.usage);
    await recordUsage({ ...ids, kind: "ANALYSIS", model: AI_MODELS.analysis, costUsd: cost, ...result.usage });
    await prisma.reelAnalysis.update({
      where: { id: analysisId },
      data: { ...result.data, status: "ANALYZED", error: null, analyzedAt: new Date(), costUsd: { increment: cost } },
    });
    return "ANALYZED";
  } catch (error) {
    if (error instanceof AppError && error.code === "LIMIT") throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Разбор ${analysisId} не удался:`, message);
    await prisma.reelAnalysis.update({ where: { id: analysisId }, data: { status: "FAILED", error: message.slice(0, 300) } });
    return "FAILED";
  }
}

/** Разбирает очередь в пределах дневного лимита: сначала поставленные вручную, потом самые сильные залёты. */
export async function processQueue(services: AiServices, now = new Date()): Promise<{ processed: number; stoppedByLimit: boolean }> {
  const doneToday = await prisma.reelAnalysis.count({
    where: { analyzedAt: { gte: localDayStart(now) }, status: { in: ["ANALYZED", "FILTERED"] } },
  });
  const capacity = Math.max(0, AI_LIMITS.analysesPerDay - doneToday);
  if (capacity === 0) return { processed: 0, stoppedByLimit: false };

  const queue = await prisma.reelAnalysis.findMany({
    where: { status: "QUEUED" },
    orderBy: [{ priority: "desc" }, { reel: { multiplier: "desc" } }],
    take: capacity,
    select: { id: true },
  });
  await refreshStaleVideos(queue.map((item) => item.id), services, now);

  let processed = 0;
  for (const item of queue) {
    try {
      await analyzeOne(item.id, services);
      processed += 1;
    } catch (error) {
      if (error instanceof AppError && error.code === "LIMIT") return { processed, stoppedByLimit: true };
      throw error;
    }
  }
  return { processed, stoppedByLimit: false };
}

/** Каждое утро — черновики сценариев из лучших свежих разборов, по N на проект. */
export async function createDailyDrafts(services: AiServices, now = new Date()): Promise<number> {
  if (localHour(now, SCRAPE_SCHEDULE.timeZone) < DAILY_DRAFTS_HOUR) return 0;
  const dayStart = localDayStart(now);
  const projects = await prisma.project.findMany({
    where: { archivedAt: null, reelAnalyses: { some: { status: "ANALYZED", scripts: { none: {} } } } },
    select: { id: true },
  });

  let created = 0;
  for (const project of projects) {
    const madeToday = await prisma.script.count({ where: { projectId: project.id, auto: true, createdAt: { gte: dayStart } } });
    const need = AI_LIMITS.dailyDraftsPerProject - madeToday;
    if (need <= 0) continue;
    const best = await prisma.reelAnalysis.findMany({
      where: { projectId: project.id, status: "ANALYZED", scripts: { none: {} } },
      orderBy: [{ relevance: { sort: "desc", nulls: "last" } }, { reel: { multiplier: "desc" } }],
      take: need,
      select: { id: true },
    });
    for (const analysis of best) {
      try {
        await generateScript(project.id, { analysisId: analysis.id, auto: true }, services.llm);
        created += 1;
      } catch (error) {
        if (error instanceof AppError && error.code === "LIMIT") return created;
        console.error("Черновик сценария не создан:", error);
      }
    }
  }
  return created;
}

export type PipelineReport = { queued: number; processed: number; drafts: number; stoppedByLimit: boolean };

export async function runAiPipeline(services: AiServices, now = new Date()): Promise<PipelineReport> {
  const queued = await enqueueVirals(now);
  const { processed, stoppedByLimit } = await processQueue(services, now);
  const drafts = stoppedByLimit ? 0 : await createDailyDrafts(services, now);
  return { queued, processed, drafts, stoppedByLimit };
}
