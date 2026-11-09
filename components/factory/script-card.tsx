"use client";

import { useState, useTransition } from "react";
import { CalendarPlusIcon, CheckIcon, ExternalLinkIcon, Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react";
import type { ScriptStatus } from "@/lib/generated/prisma/enums";
import type { ActionState } from "@/lib/actions";
import { formatMultiplier } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/components/forms";
import { deleteScriptAction, reviseScriptAction, updateScriptAction } from "@/app/(app)/p/[projectId]/factory-actions";
import { planFromScriptAction } from "@/app/(app)/p/[projectId]/content-plan/actions";

export const SCRIPT_STATUS_LABELS: Record<ScriptStatus, string> = {
  REVIEW: "На одобрении",
  SHOOT: "Снять",
  EDIT: "Монтаж",
  PUBLISH: "Выложить",
  PUBLISHED: "Опубликовано",
};

const NEXT_STATUS: Partial<Record<ScriptStatus, ScriptStatus>> = { REVIEW: "SHOOT", SHOOT: "EDIT", EDIT: "PUBLISH", PUBLISH: "PUBLISHED" };
const NEXT_LABEL: Partial<Record<ScriptStatus, string>> = { REVIEW: "Одобрить", SHOOT: "Снято", EDIT: "Смонтировано", PUBLISH: "Опубликовано" };

export type ScriptCardData = {
  id: string;
  title: string;
  hook: string;
  shots: { text: string; shoot: string }[];
  ending: string;
  caption: string;
  status: ScriptStatus;
  auto: boolean;
  reference: { url: string; username: string; multiplier: number | null } | null;
  lastRevision: string | null;
  /** Уже стоит в контент-плане */
  inPlan: boolean;
};

const textareaClass =
  "w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function ScriptCard({ projectId, script, canEdit }: { projectId: string; script: ScriptCardData; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [instruction, setInstruction] = useState("");
  const run = (fn: () => Promise<ActionState>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      notify(result);
      if (result?.ok) after?.();
    });
  const next = NEXT_STATUS[script.status];

  return (
    <article className="grid gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <h3 className="font-semibold">{script.title}</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{SCRIPT_STATUS_LABELS[script.status]}</Badge>
            {script.auto && <span>черновик конвейера</span>}
            {script.reference && (
              <a href={script.reference.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                референс @{script.reference.username} {formatMultiplier(script.reference.multiplier)}
                <ExternalLinkIcon className="size-3" />
              </a>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <Select value={script.status} onValueChange={(status) => run(() => updateScriptAction(projectId, script.id, { status: status as ScriptStatus }))}>
              <SelectTrigger className="h-8 w-40" aria-label="Статус сценария">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCRIPT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              disabled={pending || script.inPlan}
              title={script.inPlan ? "Уже в контент-плане" : "В контент-план"}
              aria-label={script.inPlan ? "Уже в контент-плане" : "Поставить в контент-план"}
              onClick={() => run(() => planFromScriptAction(projectId, script.id))}
            >
              <CalendarPlusIcon />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              aria-label="Удалить сценарий"
              onClick={() => confirm(`Удалить сценарий «${script.title}»?`) && run(() => deleteScriptAction(projectId, script.id))}
            >
              <Trash2Icon />
            </Button>
          </div>
        )}
      </header>

      <ol className="grid gap-2 text-sm">
        <li className="rounded-lg bg-amber-400/10 px-3 py-2">
          <span className="text-xs font-medium text-amber-500">Хук</span>
          <p>{script.hook}</p>
        </li>
        {script.shots.map((shot, index) => (
          <li key={index} className="grid gap-0.5 rounded-lg border px-3 py-2">
            <span className="text-xs text-muted-foreground">Кадр {index + 1}</span>
            <p>{shot.text}</p>
            <p className="text-xs text-muted-foreground">🎬 {shot.shoot}</p>
          </li>
        ))}
        <li className="rounded-lg bg-emerald-500/10 px-3 py-2">
          <span className="text-xs font-medium text-emerald-500">Финал</span>
          <p>{script.ending}</p>
        </li>
      </ol>

      <div className="grid gap-1.5">
        <Label htmlFor={`caption-${script.id}`}>Текст к выкладке</Label>
        <textarea
          id={`caption-${script.id}`}
          defaultValue={script.caption}
          rows={3}
          disabled={!canEdit}
          className={textareaClass}
          onBlur={(event) => {
            if (event.target.value !== script.caption) run(() => updateScriptAction(projectId, script.id, { caption: event.target.value }));
          }}
        />
      </div>

      {canEdit && (
        <div className="grid gap-1.5">
          <Label htmlFor={`revise-${script.id}`}>Правка для Claude</Label>
          <textarea
            id={`revise-${script.id}`}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={2}
            placeholder="Например: короче, хук с цифрой, без слова «лайфхак», финал с кодовым словом ПЛАН"
            className={textareaClass}
          />
          {script.lastRevision && <p className="text-xs text-muted-foreground">Последняя правка: {script.lastRevision}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !instruction.trim()}
              onClick={() => run(() => reviseScriptAction(projectId, script.id, instruction), () => setInstruction(""))}
            >
              {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Отправить правку
            </Button>
            {next && (
              <Button size="sm" disabled={pending} onClick={() => run(() => updateScriptAction(projectId, script.id, { status: next }))}>
                <CheckIcon />
                {NEXT_LABEL[script.status]}
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
