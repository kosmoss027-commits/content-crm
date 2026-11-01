// Генерация и правка сценариев через Claude.
import { AI_MODELS } from "@/config/ai";
import { prisma } from "@/lib/db/prisma";
import { AppError, notFoundError } from "@/lib/db/errors";
import { brandContext, scriptSchema, scriptSystem, type ScriptResult } from "@/lib/ai/prompts";
import type { LlmClient } from "@/lib/ai/types";
import { assertAiBudget, claudeCostUsd, recordUsage } from "@/lib/ai/usage";

export type ScriptSource = { analysisId?: string; idea?: string; auto?: boolean };

async function projectBrief(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true, workspaceId: true, brandMap: true },
  });
  return {
    workspaceId: project.workspaceId,
    system: scriptSystem(brandContext(project.brandMap, project.name), project.brandMap?.scriptTemplate ?? ""),
  };
}

function referenceText(analysis: {
  hook: string | null;
  hookType: string | null;
  structure: unknown;
  techniques: string[];
  whyItWorked: string[];
  adaptationIdeas: string[];
  reel: { url: string; caption: string | null };
}): string {
  const structure = Array.isArray(analysis.structure)
    ? (analysis.structure as { block: string; summary: string }[]).map((s) => `- ${s.block}: ${s.summary}`).join("\n")
    : "";
  return [
    `Референс: ${analysis.reel.url}`,
    `Хук (${analysis.hookType ?? "—"}): ${analysis.hook ?? "—"}`,
    structure && `Структура:\n${structure}`,
    analysis.techniques.length && `Приёмы: ${analysis.techniques.join("; ")}`,
    analysis.whyItWorked.length && `Почему залетело: ${analysis.whyItWorked.join("; ")}`,
    analysis.adaptationIdeas.length && `Идеи адаптации: ${analysis.adaptationIdeas.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Новый сценарий: из разбора ролика (и его хука) или из свободной идеи. */
export async function generateScript(projectId: string, source: ScriptSource, llm: LlmClient) {
  await assertAiBudget();
  const brief = await projectBrief(projectId);

  let prompt: string;
  if (source.analysisId) {
    const analysis = await prisma.reelAnalysis.findFirst({
      where: { id: source.analysisId, projectId, status: "ANALYZED" },
      include: { reel: { select: { url: true, caption: true } } },
    });
    if (!analysis) throw notFoundError();
    prompt = `Напиши сценарий для проекта по мотивам залетевшего ролика. Возьми приём и структуру, тему адаптируй под проект.\n\n${referenceText(analysis)}`;
  } else if (source.idea?.trim()) {
    prompt = `Напиши сценарий для проекта по идее: ${source.idea.trim()}`;
  } else {
    throw new AppError("VALIDATION", "Нужен разбор ролика или идея для сценария.");
  }

  const result = await llm.generate({
    kind: "SCRIPT",
    model: AI_MODELS.script,
    system: brief.system,
    content: [{ type: "text", text: prompt }],
    schema: scriptSchema,
    effort: "medium",
    maxTokens: 16000,
  });
  await recordUsage({
    workspaceId: brief.workspaceId,
    projectId,
    kind: "SCRIPT",
    model: AI_MODELS.script,
    costUsd: claudeCostUsd(AI_MODELS.script, result.usage),
    ...result.usage,
  });

  return prisma.script.create({
    data: {
      ...result.data,
      workspaceId: brief.workspaceId,
      projectId,
      analysisId: source.analysisId ?? null,
      auto: source.auto ?? false,
    },
  });
}

function scriptSnapshot(script: ScriptResult): ScriptResult {
  return { title: script.title, hook: script.hook, shots: script.shots, ending: script.ending, caption: script.caption };
}

/** Переписывает сценарий по комментарию; прежняя версия сохраняется в истории правок. */
export async function reviseScript(projectId: string, scriptId: string, instruction: string, llm: LlmClient) {
  const note = instruction.trim();
  if (!note) throw new AppError("VALIDATION", "Напишите, что поправить.");
  if (note.length > 2000) throw new AppError("VALIDATION", "Правка — не длиннее 2000 символов.");
  await assertAiBudget();

  const script = await prisma.script.findFirst({ where: { id: scriptId, projectId } });
  if (!script) throw notFoundError();
  const brief = await projectBrief(projectId);
  const current = scriptSnapshot({ ...script, shots: script.shots as ScriptResult["shots"] });

  const result = await llm.generate({
    kind: "REVISION",
    model: AI_MODELS.script,
    system: brief.system,
    content: [
      {
        type: "text",
        text: `Вот текущий сценарий (JSON):\n${JSON.stringify(current, null, 2)}\n\nПерепиши его с учётом правки автора. Меняй только то, что нужно для правки.\nПравка: ${note}`,
      },
    ],
    schema: scriptSchema,
    effort: "medium",
    maxTokens: 16000,
  });
  await recordUsage({
    workspaceId: brief.workspaceId,
    projectId,
    kind: "REVISION",
    model: AI_MODELS.script,
    costUsd: claudeCostUsd(AI_MODELS.script, result.usage),
    ...result.usage,
  });

  return prisma.$transaction(async (tx) => {
    await tx.scriptRevision.create({ data: { scriptId, instruction: note, previous: current } });
    return tx.script.update({ where: { id: scriptId }, data: result.data });
  });
}
