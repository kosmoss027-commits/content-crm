// Пробный разбор одного настоящего залёта на ЛОКАЛЬНОЙ базе с настоящими Claude (OpenRouter) и Deepgram.
// Рабочая база только читается. Запуск: npx tsx scripts/trial-analysis.ts
import "dotenv/config";
import { Client } from "pg";

const LOCAL_DB = "postgresql://postgres:postgres@localhost:54329/content_crm";
const SEED_PROJECT_OWNER = "00000000-0000-4000-8000-000000000001";

async function main() {
  // 1. Самый сильный залёт из рабочей базы (только чтение)
  const prod = new Client({ connectionString: process.env.DIRECT_URL });
  await prod.connect();
  const { rows } = await prod.query(
    `select r.url, r."shortCode", a.username from "ScrapedReel" r join "ScrapedAccount" a on a.id = r."accountId"
     where r.multiplier is not null order by r.multiplier desc limit 1`,
  );
  await prod.end();
  const top = rows[0];
  console.log("Залёт:", top.username, top.url);

  // 2. Свежие данные ролика из Apify (ссылка на видео Instagram живёт несколько дней)
  const apify = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-reel-scraper/run-sync-get-dataset-items?maxTotalChargeUsd=0.05&token=${encodeURIComponent(process.env.APIFY_TOKEN!)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: [top.url], resultsLimit: 1 }) },
  );
  const items = (await apify.json()) as Record<string, unknown>[];
  const { normalizeReel } = await import("@/scraper/normalize");
  const reel = items.map(normalizeReel).find((r) => r?.shortCode === top.shortCode) ?? items.map(normalizeReel)[0];
  if (!reel) throw new Error("Apify не вернул ролик");

  // 3. Кладём в локальную базу и ставим в разбор для «Мой блог»
  process.env.DATABASE_URL = LOCAL_DB;
  const { prisma } = await import("@/lib/db/prisma");
  const project = await prisma.project.findFirstOrThrow({
    where: { name: "Мой блог", workspace: { memberships: { some: { userId: SEED_PROJECT_OWNER } } } },
  });
  const account = await prisma.scrapedAccount.upsert({
    where: { username: reel.username },
    create: { username: reel.username, medianViews: 11937 },
    update: {},
  });
  await prisma.watchlistEntry.upsert({
    where: { projectId_accountId: { projectId: project.id, accountId: account.id } },
    create: { workspaceId: project.workspaceId, projectId: project.id, accountId: account.id },
    update: {},
  });
  const { shortCode, url, postedAt, caption, views, likes, comments, durationSec, videoUrl, coverUrl, hashtags } = reel;
  const saved = await prisma.scrapedReel.upsert({
    where: { shortCode },
    create: { shortCode, url, postedAt, caption, views, likes, comments, durationSec, videoUrl, coverUrl, hashtags, accountId: account.id, multiplier: Math.round((views / 11937) * 100) / 100 },
    update: { videoUrl, views },
  });
  await prisma.reelMedia.deleteMany({ where: { reelId: saved.id } });
  const analysis = await prisma.reelAnalysis.upsert({
    where: { projectId_reelId: { projectId: project.id, reelId: saved.id } },
    create: { workspaceId: project.workspaceId, projectId: project.id, reelId: saved.id },
    update: { status: "QUEUED", error: null, priority: process.env.TRIAL_PRIORITY === "1" },
  });

  // 4. Разбор настоящими сервисами
  const { analyzeOne } = await import("@/lib/ai/pipeline");
  const { openRouterClient } = await import("@/lib/ai/openrouter");
  const { ffmpegMediaProcessor } = await import("@/lib/ai/media");
  const started = Date.now();
  const status = await analyzeOne(analysis.id, { llm: openRouterClient, media: ffmpegMediaProcessor });
  const result = await prisma.reelAnalysis.findUniqueOrThrow({ where: { id: analysis.id } });
  const media = await prisma.reelMedia.findUnique({ where: { reelId: saved.id } });
  console.log(JSON.stringify({ status, seconds: Math.round((Date.now() - started) / 1000), costUsd: result.costUsd, relevance: result.relevance, error: result.error, mediaError: media?.error, frames: media?.frames.length, transcript: media?.transcript?.slice(0, 300) }, null, 2));
  console.log(JSON.stringify({ hook: result.hook, hookType: result.hookType, structure: result.structure, techniques: result.techniques, cta: result.cta, codeWord: result.codeWord, whyItWorked: result.whyItWorked, topic: result.topic, format: result.format, adaptationIdeas: result.adaptationIdeas }, null, 2));

  // 5. Сценарий по разбору
  if (status === "ANALYZED") {
    const { generateScript } = await import("@/lib/ai/scripts");
    const script = await generateScript(project.id, { analysisId: analysis.id }, openRouterClient);
    console.log("СЦЕНАРИЙ:", JSON.stringify({ title: script.title, hook: script.hook, shots: script.shots, ending: script.ending, caption: script.caption }, null, 2));
  }
  const spent = await prisma.aiUsage.aggregate({ _sum: { costUsd: true } });
  console.log("Всего потрачено на ИИ в пробе: $" + (spent._sum.costUsd ?? 0).toFixed(4));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
