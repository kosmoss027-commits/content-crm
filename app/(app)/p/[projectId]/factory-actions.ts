"use server";

// Действия контент-завода: карта бренда, разбор, сценарии, гипотезы, приёмы.
// projectId всегда из URL: доступ проверяется заново в каждом действии.
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { HypothesisStatus, ScriptStatus } from "@/lib/generated/prisma/enums";
import { formText, runAction, type ActionState } from "@/lib/actions";
import { requireProjectContext } from "@/lib/auth/session";
import { AppError } from "@/lib/db/errors";
import { addTechnique, removeTechnique, requestAnalysis, saveBrandMap } from "@/lib/db/analysis";
import {
  createHypothesis,
  createScript,
  deleteHypothesis,
  deleteScript,
  linkReelToHypothesis,
  reviseProjectScript,
  setHypothesisStatus,
  updateScript,
} from "@/lib/db/scripts";
import { claudeClient } from "@/lib/ai/claude";
import { isAiConfigured, runAiPipelineOnce } from "@/lib/ai/run";

function refresh(projectId: string) {
  revalidatePath(`/p/${projectId}`, "layout");
}

function assertAi() {
  if (!isAiConfigured()) throw new AppError("CONFLICT", "Claude ещё не подключён: нужен ключ ANTHROPIC_API_KEY на сервере.");
}

export async function saveBrandAction(projectId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const fields = ["author", "niche", "audience", "products", "tone", "forbidden", "examples", "topics", "keywords", "exclusions", "relevanceThreshold", "scriptTemplate"];
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await saveBrandMap(ctx, Object.fromEntries(fields.map((f) => [f, formText(formData, f)])));
  }, "Карта бренда сохранена");
  refresh(projectId);
  return result;
}

export async function requestAnalysisAction(projectId: string, reelId: string): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await requestAnalysis(ctx, reelId);
  }, isAiConfigured() ? "Поставлено в разбор первым. Обычно 1–2 минуты." : "Поставлено в очередь. Разбор начнётся, когда подключим Claude.");
  if (result?.ok) after(() => runAiPipelineOnce() ?? undefined);
  refresh(projectId);
  return result;
}

export async function createScriptAction(projectId: string, source: { analysisId?: string; idea?: string }): Promise<ActionState> {
  const result = await runAction(async () => {
    assertAi();
    const ctx = await requireProjectContext(projectId);
    await createScript(ctx, source, claudeClient);
  }, "Сценарий готов — он в разделе «Сегодня», на одобрении.");
  refresh(projectId);
  return result;
}

export async function reviseScriptAction(projectId: string, scriptId: string, instruction: string): Promise<ActionState> {
  const result = await runAction(async () => {
    assertAi();
    const ctx = await requireProjectContext(projectId);
    await reviseProjectScript(ctx, scriptId, instruction, claudeClient);
  }, "Сценарий переписан с учётом правки");
  refresh(projectId);
  return result;
}

export async function updateScriptAction(projectId: string, scriptId: string, input: { status?: ScriptStatus; caption?: string }): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await updateScript(ctx, scriptId, input);
  }, input.status ? "Статус изменён" : "Сохранено");
  refresh(projectId);
  return result;
}

export async function deleteScriptAction(projectId: string, scriptId: string): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await deleteScript(ctx, scriptId);
  }, "Сценарий удалён");
  refresh(projectId);
  return result;
}

export async function createHypothesisAction(projectId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await createHypothesis(ctx, { text: formText(formData, "text"), note: formText(formData, "note") });
  }, "Гипотеза добавлена");
  refresh(projectId);
  return result;
}

export async function setHypothesisStatusAction(projectId: string, hypothesisId: string, status: HypothesisStatus): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await setHypothesisStatus(ctx, hypothesisId, status);
  }, "Статус гипотезы изменён");
  refresh(projectId);
  return result;
}

export async function deleteHypothesisAction(projectId: string, hypothesisId: string): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await deleteHypothesis(ctx, hypothesisId);
  }, "Гипотеза удалена");
  refresh(projectId);
  return result;
}

export async function linkReelAction(projectId: string, hypothesisId: string, reelId: string): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await linkReelToHypothesis(ctx, hypothesisId, reelId);
  }, "Ролик добавлен к гипотезе");
  refresh(projectId);
  return result;
}

export async function addTechniqueAction(projectId: string, input: { title: string; description?: string; exampleUrl?: string }): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await addTechnique(ctx, input);
  }, "Приём сохранён в банк");
  refresh(projectId);
  return result;
}

export async function removeTechniqueAction(projectId: string, techniqueId: string): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await removeTechnique(ctx, techniqueId);
  }, "Приём удалён");
  refresh(projectId);
  return result;
}
