"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { syncRunsAction } from "@/app/(app)/p/[projectId]/research/actions";

const POLL_MS = 15_000;

/** Пока идёт сбор: раз в 15 секунд проверяет готовность и обновляет страницу, когда данные пришли. */
export function RunningWatcher({ projectId }: { projectId: string }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        if ((await syncRunsAction(projectId)) > 0) router.refresh();
      } catch {
        // сеть или сервер недоступны — попробуем в следующий раз
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [projectId, router]);

  return (
    <p className="mb-4 flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm">
      <Loader2Icon className="size-4 animate-spin" />
      Идёт сбор роликов. Обычно занимает 1–5 минут, страница обновится сама.
    </p>
  );
}
