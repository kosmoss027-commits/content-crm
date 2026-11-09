"use client";

import { useTransition } from "react";
import { CameraIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/forms";
import { disconnectInstagramAction, syncInstagramAction } from "@/app/(app)/p/[projectId]/content-plan/actions";

export type InstagramStatus = { username: string; expiresAt: string; lastSyncAt: string | null; lastError: string | null } | null;

const STATUS_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Instagram подключён. Публикации подтягиваются — через минуту они появятся в контент-плане." },
  denied: { ok: false, text: "Вы отменили вход в Instagram. Подключение не изменилось." },
  error: { ok: false, text: "Не удалось подключить Instagram. Попробуйте ещё раз; если повторится — напишите мне." },
  "not-configured": { ok: false, text: "На сервере ещё нет ключей приложения Instagram (INSTAGRAM_APP_ID и INSTAGRAM_APP_SECRET)." },
};

/** Блок в Настройках: подключить, обновить, отключить. */
export function InstagramPanel({ projectId, status, result, configured }: { projectId: string; status: InstagramStatus; result: string; configured: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string } | null>) => startTransition(async () => notify(await fn()));
  const message = STATUS_MESSAGES[result];

  return (
    <div className="grid gap-3">
      {message && <p className={message.ok ? "text-sm text-emerald-600 dark:text-emerald-400" : "text-sm text-destructive"}>{message.text}</p>}
      {status ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
          <div className="grid gap-0.5">
            <span className="flex items-center gap-1.5 font-medium">
              <CameraIcon className="size-4" /> @{status.username}
            </span>
            <span className="text-xs text-muted-foreground">
              {status.lastSyncAt ? `Обновлено ${formatDateTime(new Date(status.lastSyncAt))}` : "Ещё не обновлялось"} · обновляется само раз в сутки · доступ до{" "}
              {formatDateTime(new Date(status.expiresAt))}, продлевается сам
            </span>
            {status.lastError && <span className="text-xs text-destructive">{status.lastError}</span>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => syncInstagramAction(projectId))}>
              <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
              Обновить сейчас
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => confirm("Отключить Instagram? Уже загруженные публикации останутся.") && run(() => disconnectInstagramAction(projectId))}
            >
              <UnplugIcon />
              Отключить
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-3 text-sm">
          <p className="text-muted-foreground">
            Подключите свой Instagram (профессиональный аккаунт), чтобы публикации и статистика подтягивались сами. Вход — на официальной странице Instagram,
            пароль Content CRM не видит.
          </p>
          <Button asChild size="sm" disabled={!configured}>
            <a href={`/api/instagram/connect?project=${projectId}`}>
              <CameraIcon />
              Подключить Instagram
            </a>
          </Button>
        </div>
      )}
      {!configured && !status && <p className="text-xs text-muted-foreground">Кнопка заработает после того, как мы создадим приложение в Meta for Developers и добавим его ключи на сервер.</p>}
    </div>
  );
}

/** Кнопка в шапке контент-плана, когда Instagram подключён. */
export function InstagramSyncButton({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => notify(await syncInstagramAction(projectId)))}>
      <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
      {pending ? "Обновляю…" : "Обновить из Instagram"}
    </Button>
  );
}
