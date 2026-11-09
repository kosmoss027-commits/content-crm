"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireProjectContext } from "@/lib/auth/session";
import { createCampaign, deleteCampaign, saveWarmupDay, updateCampaign, type CampaignInput, type DayInput } from "@/lib/db/warmups";
import { createTask, deleteTask, setTaskStatus, updateTask, type TaskInput } from "@/lib/db/tasks";

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
