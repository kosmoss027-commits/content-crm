// Сценарии и гипотезы — в рамках проекта.
import { z } from "zod";
import type { HypothesisStatus, ScriptStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { notFoundError } from "@/lib/db/errors";
import { assertCan, type ProjectContext } from "@/lib/db/access";
import { parseInput } from "@/lib/validation";
import { generateScript, reviseScript } from "@/lib/ai/scripts";
import type { LlmClient } from "@/lib/ai/types";

export const SCRIPT_STATUSES: ScriptStatus[] = ["REVIEW", "SHOOT", "EDIT", "PUBLISH", "PUBLISHED"];

export async function listScripts(ctx: ProjectContext, status?: ScriptStatus) {
  return prisma.script.findMany({
    where: { projectId: ctx.projectId, ...(status ? { status } : {}) },
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    include: {
      analysis: { select: { reel: { select: { id: true, url: true, coverUrl: true, multiplier: true, account: { select: { username: true } } } } } },
      revisions: { orderBy: { createdAt: "desc" }, take: 3, select: { instruction: true, createdAt: true } },
      publication: { select: { id: true } },
    },
  });
}

export type ScriptWithRefs = Awaited<ReturnType<typeof listScripts>>[number];

export async function scriptCounts(ctx: ProjectContext): Promise<Record<ScriptStatus, number>> {
  const rows = await prisma.script.groupBy({ by: ["status"], where: { projectId: ctx.projectId }, _count: true });
  const counts = Object.fromEntries(SCRIPT_STATUSES.map((s) => [s, 0])) as Record<ScriptStatus, number>;
  for (const row of rows) counts[row.status] = row._count;
  return counts;
}

async function findScript(ctx: ProjectContext, scriptId: string) {
  const script = await prisma.script.findFirst({ where: { id: scriptId, projectId: ctx.projectId }, select: { id: true } });
  if (!script) throw notFoundError();
  return script;
}

const scriptUpdate = z.object({
  status: z.enum(["REVIEW", "SHOOT", "EDIT", "PUBLISH", "PUBLISHED"]).optional(),
  caption: z.string().max(5000, "Текст к выкладке — до 5000 символов").optional(),
});

export async function updateScript(ctx: ProjectContext, scriptId: string, input: { status?: ScriptStatus; caption?: string }) {
  assertCan(ctx, "research.manage");
  const data = parseInput(scriptUpdate, input);
  const script = await findScript(ctx, scriptId);
  await prisma.script.update({ where: { id: script.id }, data });
}

export async function deleteScript(ctx: ProjectContext, scriptId: string) {
  assertCan(ctx, "research.manage");
  const script = await findScript(ctx, scriptId);
  await prisma.script.delete({ where: { id: script.id } });
}

export async function createScript(ctx: ProjectContext, source: { analysisId?: string; idea?: string }, llm: LlmClient) {
  assertCan(ctx, "research.manage");
  return generateScript(ctx.projectId, source, llm);
}

export async function reviseProjectScript(ctx: ProjectContext, scriptId: string, instruction: string, llm: LlmClient) {
  assertCan(ctx, "research.manage");
  return reviseScript(ctx.projectId, scriptId, instruction, llm);
}

// ─── Гипотезы ───

export async function listHypotheses(ctx: ProjectContext) {
  return prisma.hypothesis.findMany({
    where: { projectId: ctx.projectId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { reels: { select: { reel: { select: { id: true, url: true, multiplier: true, account: { select: { username: true } } } } } } },
  });
}

const hypothesisInput = z.object({
  text: z.string().trim().min(3, "Сформулируйте гипотезу").max(500, "Не длиннее 500 символов"),
  note: z.string().trim().max(2000).default(""),
});

export async function createHypothesis(ctx: ProjectContext, input: unknown) {
  assertCan(ctx, "research.manage");
  const data = parseInput(hypothesisInput, input);
  return prisma.hypothesis.create({ data: { ...data, workspaceId: ctx.workspaceId, projectId: ctx.projectId } });
}

async function findHypothesis(ctx: ProjectContext, hypothesisId: string) {
  const hypothesis = await prisma.hypothesis.findFirst({ where: { id: hypothesisId, projectId: ctx.projectId }, select: { id: true } });
  if (!hypothesis) throw notFoundError();
  return hypothesis;
}

export async function setHypothesisStatus(ctx: ProjectContext, hypothesisId: string, status: HypothesisStatus) {
  assertCan(ctx, "research.manage");
  const valid = parseInput(z.enum(["TESTING", "CONFIRMED", "REJECTED"]), status);
  const hypothesis = await findHypothesis(ctx, hypothesisId);
  await prisma.hypothesis.update({ where: { id: hypothesis.id }, data: { status: valid } });
}

export async function deleteHypothesis(ctx: ProjectContext, hypothesisId: string) {
  assertCan(ctx, "research.manage");
  const hypothesis = await findHypothesis(ctx, hypothesisId);
  await prisma.hypothesis.delete({ where: { id: hypothesis.id } });
}

/** Привязать ролик-референс к гипотезе: и гипотеза, и ролик должны принадлежать проекту. */
export async function linkReelToHypothesis(ctx: ProjectContext, hypothesisId: string, reelId: string) {
  assertCan(ctx, "research.manage");
  const hypothesis = await findHypothesis(ctx, hypothesisId);
  const reel = await prisma.scrapedReel.findFirst({
    where: { id: reelId, account: { watches: { some: { projectId: ctx.projectId } } } },
    select: { id: true },
  });
  if (!reel) throw notFoundError();
  await prisma.hypothesisReel.upsert({
    where: { hypothesisId_reelId: { hypothesisId: hypothesis.id, reelId: reel.id } },
    create: { hypothesisId: hypothesis.id, reelId: reel.id },
    update: {},
  });
}
