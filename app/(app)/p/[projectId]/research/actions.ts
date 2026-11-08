"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requestAnalysis } from "@/lib/db/analysis";
import { runAiPipelineOnce } from "@/lib/ai/run";
import { formText, runAction, type ActionState } from "@/lib/actions";
import { requireProjectContext } from "@/lib/auth/session";
import { AppError } from "@/lib/db/errors";
import { toggleReelMark } from "@/lib/db/reels";
import { addAccounts, removeEntry, updateEntry, usernamesForManualCollect, watchedForCollectAll } from "@/lib/db/watchlist";
import { startCollection } from "@/lib/research/collect";
import { syncPendingRuns } from "@/lib/research/ingest";
import type { Market, WatchStatus } from "@/lib/generated/prisma/enums";

// projectId всегда из URL: доступ проверяется заново в каждом действии.

function refresh(projectId: string) {
  revalidatePath(`/p/${projectId}`, "layout");
}

export async function addAccountsAction(projectId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let message = "";
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    const market = formText(formData, "market") === "FOREIGN" ? "FOREIGN" : "CIS";
    const added = await addAccounts(ctx, formText(formData, "usernames"), market);

    const parts = [`Добавлено: ${added.added.length}`];
    if (added.alreadyWatched.length) parts.push(`уже были: ${added.alreadyWatched.join(", ")}`);
    if (added.invalid.length) parts.push(`не похоже на ник: ${added.invalid.join(", ")}`);
    message = parts.join(". ");

    if (added.needInitial.length) {
      const base = { workspaceId: ctx.workspaceId, projectId: ctx.projectId, usernames: added.needInitial };
      const reels = await startCollection({ ...base, kind: "INITIAL" });
      await startCollection({ ...base, kind: "PROFILE" });
      message += `. ${reels.message}`;
    }
  });
  refresh(projectId);
  return result?.ok ? { ok: true, message } : result;
}

export async function updateEntryAction(
  projectId: string,
  entryId: string,
  input: { status?: WatchStatus; market?: Market; niche?: string | null },
): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await updateEntry(ctx, entryId, input);
  });
  refresh(projectId);
  return result;
}

export async function removeEntryAction(projectId: string, entryId: string): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await removeEntry(ctx, entryId);
  }, "Аккаунт убран из разведки");
  refresh(projectId);
  return result;
}

export async function collectNowAction(projectId: string, entryId?: string): Promise<ActionState> {
  let message = "";
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    const { usernames, initial } = await usernamesForManualCollect(ctx, entryId);
    const outcome = await startCollection({
      kind: initial ? "INITIAL" : "MANUAL",
      usernames,
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
    });
    if (outcome.status !== "started") throw new AppError("CONFLICT", outcome.message);
    message = outcome.message;
  });
  refresh(projectId);
  return result?.ok ? { ok: true, message } : result;
}

/**
 * Одна кнопка «Собрать и разобрать»: ролики всех отслеживаемых аккаунтов + подписчики и аватары.
 * Разбор новых залётов стартует сам, когда Apify вернёт данные (webhook), и сразу — для того, что уже в очереди.
 */
export async function collectEverythingAction(projectId: string): Promise<ActionState> {
  let message = "";
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    const { fresh, known } = await watchedForCollectAll(ctx);
    if (fresh.length + known.length === 0) throw new AppError("CONFLICT", "В проекте нет отслеживаемых аккаунтов.");
    const scope = { workspaceId: ctx.workspaceId, projectId: ctx.projectId };
    const outcomes = [
      ...(known.length ? [await startCollection({ kind: "MANUAL", usernames: known, ...scope })] : []),
      ...(fresh.length ? [await startCollection({ kind: "INITIAL", usernames: fresh, ...scope })] : []),
      await startCollection({ kind: "PROFILE", usernames: [...known, ...fresh], ...scope }),
    ];
    const started = outcomes.filter((o) => o.status === "started");
    if (started.length === 0) throw new AppError("CONFLICT", outcomes[0].message);
    message = `Запущено: ролики ${known.length + fresh.length} акк. и подписчики. Через 5–15 минут появятся новые ролики, затем начнётся разбор залётов.`;
  });
  if (result?.ok) after(() => runAiPipelineOnce());
  refresh(projectId);
  return result?.ok ? { ok: true, message } : result;
}

export async function toggleMarkAction(projectId: string, reelId: string): Promise<ActionState> {
  let marked = false;
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    marked = await toggleReelMark(ctx, reelId);
    // «В работу» — ролик разбирается вне очереди, без проверки на пользу.
    if (marked) await requestAnalysis(ctx, reelId);
  });
  if (result?.ok && marked) after(() => runAiPipelineOnce() ?? undefined);
  refresh(projectId);
  return result?.ok ? { ok: true, message: marked ? "В работе: ролик разбирается первым" : "Отметка снята" } : result;
}

/** Забрать результаты завершившихся сборов (локально и если webhook не дошёл). */
export async function syncRunsAction(projectId: string): Promise<number> {
  await requireProjectContext(projectId);
  const finished = await syncPendingRuns();
  if (finished > 0) {
    after(() => runAiPipelineOnce());
    refresh(projectId);
  }
  return finished;
}
