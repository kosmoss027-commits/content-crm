"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireProjectContext } from "@/lib/auth/session";
import { createCampaign, deleteCampaign, saveWarmupDay, updateCampaign, type CampaignInput, type DayInput } from "@/lib/db/warmups";
import { createTask, deleteTask, setTaskStatus, updateTask, type TaskInput } from "@/lib/db/tasks";
import { addExpense, deleteExpense, type ExpenseInput } from "@/lib/db/finance";
import { createBoardItem, deleteBoardItem, updateBoardItem, type BoardItemInput, type BoardItemPatch } from "@/lib/db/board";

// Прогревы и задачи. projectId всегда из URL: доступ проверяется заново в каждом действии.

type Ctx = Awaited<ReturnType<typeof requireProjectContext>>;

async function act(projectId: string, fn: (ctx: Ctx) => Promise<unknown>, message: string, paths: string[]): Promise<ActionState> {
  const result = await runAction(async () => {
    await fn(await requireProjectContext(projectId));
  }, message);
  for (const path of paths) revalidatePath(`/p/${projectId}/${path}`, "layout");
  return result;
}

export async function saveCampaignAction(projectId: string, id: string | null, input: CampaignInput): Promise<{ ok: boolean; message: string; campaignId?: string } | null> {
  let campaignId = id ?? "";
  const result = await act(
    projectId,
    async (ctx) => {
      if (id) await updateCampaign(ctx, id, input);
      else campaignId = (await createCampaign(ctx, input)).id;
    },
    id ? "Сохранено" : "Прогрев создан",
    ["warmups"],
  );
  return result?.ok ? { ...result, campaignId } : result;
}

export async function deleteCampaignAction(projectId: string, id: string) {
  return act(projectId, (ctx) => deleteCampaign(ctx, id), "Прогрев удалён", ["warmups", "content-plan"]);
}

export async function saveWarmupDayAction(projectId: string, campaignId: string, date: string, input: DayInput) {
  return act(projectId, (ctx) => saveWarmupDay(ctx, campaignId, date, input), "Сохранено", ["warmups"]);
}

const TASK_PATHS = ["tasks", "today", "summary", "team"];

export async function saveTaskAction(projectId: string, id: string | null, input: TaskInput) {
  return act(projectId, (ctx) => (id ? updateTask(ctx, id, input) : createTask(ctx, input)), id ? "Сохранено" : "Задача добавлена", TASK_PATHS);
}

export async function setTaskStatusAction(projectId: string, id: string, status: string) {
  return act(projectId, (ctx) => setTaskStatus(ctx, id, status), status === "DONE" ? "Готово" : "Сохранено", TASK_PATHS);
}

export async function deleteTaskAction(projectId: string, id: string) {
  return act(projectId, (ctx) => deleteTask(ctx, id), "Задача удалена", TASK_PATHS);
}

// ─── Доска прогрева ───

export async function createBoardItemAction(projectId: string, campaignId: string, input: BoardItemInput): Promise<{ ok: boolean; message: string; item?: BoardItemView } | null> {
  let item: BoardItemView | undefined;
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    const created = await createBoardItem(ctx, campaignId, input);
    item = { id: created.id, kind: created.kind, x: created.x, y: created.y, width: created.width, height: created.height, text: created.text, color: created.color, imageUrl: created.imageUrl };
  }, "Добавлено");
  return result?.ok ? { ...result, item } : result;
}

export async function updateBoardItemAction(projectId: string, id: string, patch: BoardItemPatch) {
  return runAction(async () => {
    await updateBoardItem(await requireProjectContext(projectId), id, patch);
  });
}

export async function deleteBoardItemAction(projectId: string, id: string) {
  return runAction(async () => {
    await deleteBoardItem(await requireProjectContext(projectId), id);
  }, "Удалено");
}

export type BoardItemView = { id: string; kind: "STICKY" | "IMAGE"; x: number; y: number; width: number; height: number; text: string; color: string; imageUrl: string | null };

// ─── P&L ───

export async function addExpenseAction(projectId: string, input: ExpenseInput) {
  return act(projectId, (ctx) => addExpense(ctx, input), "Расход записан", ["pnl"]);
}

export async function deleteExpenseAction(projectId: string, id: string) {
  return act(projectId, (ctx) => deleteExpense(ctx, id), "Расход удалён", ["pnl"]);
}
