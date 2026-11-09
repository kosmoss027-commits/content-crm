"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/lib/actions";
import { requireProjectContext } from "@/lib/auth/session";
import {
  addPayment,
  convertLead,
  createClient,
  createKeyword,
  createLead,
  deleteClient,
  deleteLead,
  deletePayment,
  updateClient,
  updateKeyword,
  updateLead,
  type ClientInput,
} from "@/lib/db/sales";

// projectId всегда из URL: доступ проверяется заново в каждом действии.

function refresh(projectId: string) {
  for (const section of ["keywords", "leads", "clients", "stats"]) revalidatePath(`/p/${projectId}/${section}`, "layout");
}

async function act(projectId: string, fn: (ctx: Awaited<ReturnType<typeof requireProjectContext>>) => Promise<unknown>, message: string): Promise<ActionState> {
  const result = await runAction(async () => {
    await fn(await requireProjectContext(projectId));
  }, message);
  refresh(projectId);
  return result;
}

export async function createKeywordAction(projectId: string, input: { word: string; product: string; note: string }) {
  return act(projectId, (ctx) => createKeyword(ctx, input), "Кодовое слово добавлено");
}

export async function updateKeywordAction(projectId: string, id: string, input: { product?: string; note?: string; archived?: boolean }) {
  return act(projectId, (ctx) => updateKeyword(ctx, id, input), input.archived === undefined ? "Сохранено" : input.archived ? "Слово в архиве" : "Слово снова активно");
}

export async function createLeadAction(
  projectId: string,
  input: { handle: string; contact: string; source: "COMMENT" | "DIRECT" | "TELEGRAM" | "OTHER"; keywordId: string | null; publicationId: string | null; note: string; date: string | null },
) {
  return act(projectId, (ctx) => createLead(ctx, input), "Заявка добавлена");
}

export async function updateLeadAction(projectId: string, id: string, input: { status?: string; note?: string; contact?: string }) {
  return act(projectId, (ctx) => updateLead(ctx, id, input), "Сохранено");
}

export async function deleteLeadAction(projectId: string, id: string) {
  return act(projectId, (ctx) => deleteLead(ctx, id), "Заявка удалена");
}

/** Возвращает id клиента, чтобы сразу открыть его карточку. */
export async function convertLeadAction(projectId: string, id: string): Promise<{ ok: boolean; message: string; clientId?: string }> {
  let clientId = "";
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    clientId = (await convertLead(ctx, id)).id;
  }, "Клиент создан — внесите оплату в его карточке");
  refresh(projectId);
  return result?.ok ? { ...result, clientId } : (result ?? { ok: false, message: "Ошибка" });
}

export async function saveClientAction(projectId: string, id: string | null, input: ClientInput): Promise<{ ok: boolean; message: string; clientId?: string }> {
  let clientId = id ?? "";
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    if (id) await updateClient(ctx, id, input);
    else clientId = (await createClient(ctx, input)).id;
  }, id ? "Сохранено" : "Клиент добавлен");
  refresh(projectId);
  return result?.ok ? { ...result, clientId } : (result ?? { ok: false, message: "Ошибка" });
}

export async function deleteClientAction(projectId: string, id: string) {
  return act(projectId, (ctx) => deleteClient(ctx, id), "Клиент удалён");
}

export async function addPaymentAction(projectId: string, clientId: string, input: { amountRub: number; product: string; paidAt: string; note: string }) {
  return act(projectId, (ctx) => addPayment(ctx, clientId, input), "Оплата записана");
}

export async function deletePaymentAction(projectId: string, id: string) {
  return act(projectId, (ctx) => deletePayment(ctx, id), "Оплата удалена");
}
