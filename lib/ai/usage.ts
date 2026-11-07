// Учёт и лимит расходов на ИИ.
import type { AiUsageKind } from "@/lib/generated/prisma/enums";
import { AI_LIMITS, CLAUDE_PRICES, TRANSCRIPT_PRICE_PER_MINUTE } from "@/config/ai";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/db/errors";
import type { LlmResult } from "@/lib/ai/types";

const MILLION = 1_000_000;

export function claudeCostUsd(model: string, usage: LlmResult<unknown>["usage"]): number {
  if (usage.costUsd !== undefined) return usage.costUsd;
  const price = CLAUDE_PRICES[model];
  if (!price) return 0;
  return (
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    MILLION
  );
}

export function transcriptCostUsd(audioSeconds: number): number {
  return (audioSeconds / 60) * TRANSCRIPT_PRICE_PER_MINUTE;
}

export async function recordUsage(entry: {
  kind: AiUsageKind;
  model: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  workspaceId?: string;
  projectId?: string;
}) {
  const { kind, model, costUsd, inputTokens, outputTokens, workspaceId, projectId } = entry;
  await prisma.aiUsage.create({ data: { kind, model, costUsd, inputTokens, outputTokens, workspaceId, projectId } });
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function aiSpentThisMonth(now = new Date()): Promise<number> {
  const result = await prisma.aiUsage.aggregate({ where: { createdAt: { gte: startOfMonth(now) } }, _sum: { costUsd: true } });
  return result._sum.costUsd ?? 0;
}

export async function assertAiBudget(now = new Date()): Promise<void> {
  if ((await aiSpentThisMonth(now)) >= AI_LIMITS.monthlyUsd) {
    throw new AppError("LIMIT", `Исчерпан месячный лимит расходов на ИИ ($${AI_LIMITS.monthlyUsd}). Разбор и сценарии остановлены до следующего месяца.`);
  }
}
