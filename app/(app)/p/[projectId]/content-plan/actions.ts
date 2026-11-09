"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireProjectContext } from "@/lib/auth/session";
import { dateToDay, todayDay } from "@/lib/content/dates";
import { assertCan } from "@/lib/db/access";
import { AppError } from "@/lib/db/errors";
import { instagramClient } from "@/lib/instagram/client";
import { disconnectInstagram, syncInstagram } from "@/lib/instagram/sync";
import {
  createPublication,
  deletePublication,
  getPublication,
  movePublication,
  planFromScript,
  repeatPublication,
  toggleStar,
  updatePublication,
  type PublicationInput,
} from "@/lib/db/publications";

// projectId всегда из URL: доступ проверяется заново в каждом действии.

function refresh(projectId: string) {
  revalidatePath(`/p/${projectId}/content-plan`);
  revalidatePath(`/p/${projectId}/stats`);
}

export async function savePublicationAction(projectId: string, id: string | null, input: PublicationInput): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    if (id) await updatePublication(ctx, id, input);
    else await createPublication(ctx, input);
  }, id ? "Сохранено" : "Публикация добавлена в план");
  refresh(projectId);
  return result;
}

export async function movePublicationAction(projectId: string, id: string, target: { date: string | null; platform?: string }): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await movePublication(ctx, id, target);
  }, "Перенесено");
  refresh(projectId);
  return result;
}

export async function deletePublicationAction(projectId: string, id: string): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await deletePublication(ctx, id);
  }, "Публикация удалена");
  refresh(projectId);
  return result;
}

export async function repeatPublicationAction(projectId: string, id: string): Promise<ActionState> {
  let message = "";
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    const copy = await repeatPublication(ctx, id, todayDay());
    message = `Копия поставлена на ${copy.date ? dateToDay(copy.date).split("-").reverse().join(".") : "без даты"}`;
  });
  refresh(projectId);
  return result?.ok ? { ok: true, message } : result;
}

export async function toggleStarAction(projectId: string, id: string): Promise<ActionState> {
  let starred = false;
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    starred = await toggleStar(ctx, id);
  });
  refresh(projectId);
  return result?.ok ? { ok: true, message: starred ? "Отмечено как удачная" : "Отметка снята" } : result;
}

export async function planFromScriptAction(projectId: string, scriptId: string): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await planFromScript(ctx, scriptId, null);
  }, "Сценарий в контент-плане, в колонке «Без даты»");
  refresh(projectId);
  revalidatePath(`/p/${projectId}`, "layout");
  return result;
}

export async function syncInstagramAction(projectId: string): Promise<ActionState> {
  let message = "";
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    assertCan(ctx, "content.manage");
    const report = await syncInstagram(ctx.projectId, instagramClient);
    if ("error" in report) throw new AppError("CONFLICT", report.error);
    message = `Из Instagram: ${report.media} публ., новых ${report.created}, связано с планом ${report.linked}.`;
  });
  refresh(projectId);
  return result?.ok ? { ok: true, message } : result;
}

export async function disconnectInstagramAction(projectId: string): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await disconnectInstagram(ctx);
  }, "Instagram отключён. Публикации и статистика остались в плане.");
  revalidatePath(`/p/${projectId}/settings`);
  return result;
}

/** Данные для карточки публикации: даты строками, чтобы передать в браузер. */
export async function loadPublicationAction(projectId: string, id: string) {
  const ctx = await requireProjectContext(projectId);
  const p = await getPublication(ctx, id);
  return {
    id: p.id,
    title: p.title,
    platform: p.platform,
    type: p.type,
    status: p.status,
    date: p.date ? dateToDay(p.date) : null,
    text: p.text,
    note: p.note,
    codeWord: p.codeWord,
    labels: p.labels,
    isStar: p.isStar,
    referenceUrl: p.referenceReel?.url ?? null,
    referenceLabel: p.referenceReel ? `@${p.referenceReel.account.username}` : null,
    scriptTitle: p.script?.title ?? null,
    fromInstagram: p.igMediaId !== null,
    permalink: p.permalink,
    statsUpdatedAt: p.statsUpdatedAt?.toISOString() ?? null,
    views: p.views,
    reach: p.reach,
    likes: p.likes,
    comments: p.comments,
    saves: p.saves,
    shares: p.shares,
    avgWatchSec: p.avgWatchSec,
    profileVisits: p.profileVisits,
    linkClicks: p.linkClicks,
    follows: p.follows,
    coldAudiencePct: p.coldAudiencePct,
  };
}

export type PublicationFormData = Awaited<ReturnType<typeof loadPublicationAction>>;
