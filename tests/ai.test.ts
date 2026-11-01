// Конвейер разбора с поддельными Claude и Deepgram.
import { beforeEach, describe, expect, it } from "vitest";
import { AI_LIMITS } from "@/config/ai";
import { prisma } from "@/lib/db/prisma";
import { createDailyDrafts, enqueueVirals, localDayStart, processQueue } from "@/lib/ai/pipeline";
import { reviseScript } from "@/lib/ai/scripts";
import type { AiServices, LlmRequest, MediaProcessor } from "@/lib/ai/types";
import { createUser, createWorkspace, resetDatabase } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const USAGE = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };

const ANALYSIS = {
  hook: "Я потратил 100 тысяч на рекламу и вот что понял",
  hookType: "я сделал X",
  structure: [{ block: "хук", summary: "цифра и интрига" }],
  techniques: ["текст на экране"],
  cta: "Напиши ПЛАН",
  codeWord: "ПЛАН",
  whyItWorked: ["конкретная цифра"],
  topic: "реклама",
  format: "говорящая голова",
  niche: "маркетинг",
  adaptationIdeas: ["рассказать про свой бюджет"],
};
const SCRIPT = { title: "Т", hook: "Х", shots: [{ text: "говорим", shoot: "снимаем" }], ending: "Ф", caption: "П" };

function fakeServices(relevanceScore = 8, mediaFails = false) {
  const calls: string[] = [];
  const llm = {
    async generate<T>(request: LlmRequest<T>) {
      calls.push(request.kind);
      const data = request.kind === "RELEVANCE" ? { score: relevanceScore, reason: "тест" } : request.kind === "ANALYSIS" ? ANALYSIS : { ...SCRIPT, title: `v${calls.length}` };
      return { data: data as T, usage: USAGE };
    },
  };
  const media: MediaProcessor = {
    async process() {
      if (mediaFails) throw new Error("ссылка устарела");
      return { transcript: "привет", audioSeconds: 30, frames: ["ZmFrZQ=="] };
    },
  };
  return { services: { llm, media } satisfies AiServices, calls };
}

async function setup() {
  const user = await createUser("u@test.ru");
  const other = await createUser("o@test.ru");
  const ws = await createWorkspace(user, ["Мой блог"]);
  const foreign = await createWorkspace(other, ["Чужой"]);
  const project = ws.projects[0];

  const account = await prisma.scrapedAccount.create({ data: { username: "alpha", medianViews: 1000 } });
  const unwatched = await prisma.scrapedAccount.create({ data: { username: "beta", medianViews: 1000 } });
  await prisma.watchlistEntry.create({ data: { workspaceId: ws.id, projectId: project.id, accountId: account.id } });

  const mkReel = (accountId: string, shortCode: string, multiplier: number, daysAgo = 3) =>
    prisma.scrapedReel.create({
      data: {
        accountId,
        shortCode,
        url: `https://instagram.com/reel/${shortCode}`,
        postedAt: new Date(Date.now() - daysAgo * DAY),
        views: multiplier * 1000,
        multiplier,
        videoUrl: "https://cdn/video.mp4",
      },
    });
  await mkReel(account.id, "viral1", 8);
  await mkReel(account.id, "viral2", 4);
  await mkReel(account.id, "normal", 1.2);
  await mkReel(account.id, "ancient", 9, 400);
  await mkReel(unwatched.id, "foreign", 20);
  return { project, foreignProject: foreign.projects[0] };
}

describe("очередь разбора", () => {
  beforeEach(resetDatabase);

  it("в очередь попадают только свежие залёты отслеживаемых аккаунтов, без дублей", async () => {
    const { project } = await setup();
    expect(await enqueueVirals()).toBe(2);
    expect(await enqueueVirals()).toBe(0);
    const queued = await prisma.reelAnalysis.findMany({ where: { projectId: project.id }, include: { reel: true } });
    expect(queued.map((a) => a.reel.shortCode).sort()).toEqual(["viral1", "viral2"]);
  });

  it("бесполезные для проекта ролики отсеиваются без полного разбора", async () => {
    await setup();
    await enqueueVirals();
    const { services, calls } = fakeServices(3);
    await processQueue(services);

    expect(calls).toEqual(["RELEVANCE", "RELEVANCE"]);
    expect(await prisma.reelAnalysis.count({ where: { status: "FILTERED" } })).toBe(2);
  });

  it("полезные разбираются: поля, расшифровка и расходы сохраняются", async () => {
    await setup();
    await enqueueVirals();
    const { services } = fakeServices(8);
    await processQueue(services);

    const analysis = await prisma.reelAnalysis.findFirstOrThrow({ where: { reel: { shortCode: "viral1" } } });
    expect(analysis).toMatchObject({ status: "ANALYZED", hook: ANALYSIS.hook, codeWord: "ПЛАН", relevance: 8 });
    expect(analysis.costUsd).toBeGreaterThan(0);
    expect((await prisma.reelMedia.findFirstOrThrow()).transcript).toBe("привет");
    expect(await prisma.aiUsage.count({ where: { kind: "TRANSCRIPT" } })).toBe(2);
  });

  it("поставленные вручную идут без проверки на пользу", async () => {
    const { project } = await setup();
    await enqueueVirals();
    await prisma.reelAnalysis.updateMany({ where: { projectId: project.id }, data: { priority: true } });
    const { services, calls } = fakeServices(0);
    await processQueue(services);
    expect(calls).toEqual(["ANALYSIS", "ANALYSIS"]);
  });

  it("если видео не скачалось, разбор идёт по подписи", async () => {
    await setup();
    await enqueueVirals();
    const { services } = fakeServices(8, true);
    await processQueue(services);
    expect(await prisma.reelAnalysis.count({ where: { status: "ANALYZED" } })).toBe(2);
    expect((await prisma.reelMedia.findFirstOrThrow()).error).toContain("ссылка устарела");
  });

  it("при исчерпанном лимите на ИИ разбор останавливается, очередь сохраняется", async () => {
    await setup();
    await enqueueVirals();
    await prisma.aiUsage.create({ data: { kind: "ANALYSIS", model: "x", costUsd: AI_LIMITS.monthlyUsd } });
    const { services, calls } = fakeServices(8);
    const result = await processQueue(services);
    expect(result.stoppedByLimit).toBe(true);
    expect(calls).toEqual([]);
    expect(await prisma.reelAnalysis.count({ where: { status: "QUEUED" } })).toBe(2);
  });
});

describe("сценарии", () => {
  beforeEach(resetDatabase);

  it("утренние черновики появляются только после 9:00 и не больше лимита", async () => {
    const { project } = await setup();
    await enqueueVirals();
    const { services } = fakeServices(8);
    await processQueue(services);

    const early = new Date("2026-11-02T02:00:00Z"); // 07:00 Алматы
    const late = new Date("2026-11-02T05:00:00Z"); // 10:00 Алматы
    expect(await createDailyDrafts(services, early)).toBe(0);
    expect(await createDailyDrafts(services, late)).toBe(2); // разобрано всего 2 ролика
    const scripts = await prisma.script.findMany({ where: { projectId: project.id } });
    expect(scripts.every((s) => s.auto && s.status === "REVIEW")).toBe(true);
  });

  it("правка сохраняет прежнюю версию; чужой сценарий не найти", async () => {
    const { project, foreignProject } = await setup();
    const script = await prisma.script.create({
      data: { ...SCRIPT, workspaceId: project.workspaceId, projectId: project.id },
    });
    const { services } = fakeServices();

    await expect(reviseScript(foreignProject.id, script.id, "короче", services.llm)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const updated = await reviseScript(project.id, script.id, "короче", services.llm);
    expect(updated.title).not.toBe("Т");
    const revision = await prisma.scriptRevision.findFirstOrThrow({ where: { scriptId: script.id } });
    expect(revision).toMatchObject({ instruction: "короче", previous: expect.objectContaining({ title: "Т" }) });
  });
});

describe("сутки по Алматы", () => {
  it("начало суток — полночь в UTC+5", () => {
    expect(localDayStart(new Date("2026-11-02T03:00:00Z")).toISOString()).toBe("2026-11-01T19:00:00.000Z");
    expect(localDayStart(new Date("2026-11-01T20:00:00Z")).toISOString()).toBe("2026-11-01T19:00:00.000Z");
  });
});
