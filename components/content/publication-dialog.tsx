"use client";

import { useState, useTransition } from "react";
import { CopyIcon, ExternalLinkIcon, StarIcon, Trash2Icon } from "lucide-react";
import { PLATFORMS, PUBLICATION_STATUSES, PUBLICATION_TYPES } from "@/config/content";
import type { ActionState } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/components/forms";
import {
  deletePublicationAction,
  repeatPublicationAction,
  savePublicationAction,
  type PublicationFormData,
} from "@/app/(app)/p/[projectId]/content-plan/actions";

type Draft = Omit<PublicationFormData, "id" | "referenceLabel" | "scriptTitle" | "fromInstagram" | "permalink" | "statsUpdatedAt">;
type NumberKey = "views" | "reach" | "likes" | "comments" | "saves" | "shares" | "profileVisits" | "linkClicks" | "follows" | "coldAudiencePct";

export function emptyDraft(date: string | null, platform: Draft["platform"] = "INSTAGRAM"): Draft {
  return {
    title: "",
    platform,
    type: "EXPERT",
    status: "IDEA",
    date,
    text: "",
    note: "",
    codeWord: null,
    labels: [],
    isStar: false,
    referenceUrl: null,
    views: null,
    reach: null,
    likes: null,
    comments: null,
    saves: null,
    shares: null,
    avgWatchSec: null,
    profileVisits: null,
    linkClicks: null,
    follows: null,
    coldAudiencePct: null,
  };
}

const API_STATS: { key: NumberKey; label: string }[] = [
  { key: "views", label: "Просмотры" },
  { key: "reach", label: "Охват" },
  { key: "likes", label: "Лайки" },
  { key: "comments", label: "Комментарии" },
  { key: "saves", label: "Сохранения" },
  { key: "shares", label: "Репосты" },
];

const MANUAL_STATS: { key: NumberKey; label: string }[] = [
  { key: "coldAudiencePct", label: "Холодная аудитория, %" },
  { key: "profileVisits", label: "Посещения профиля" },
  { key: "linkClicks", label: "Переходы по ссылке" },
  { key: "follows", label: "Подписки" },
];

const fieldClass =
  "w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function NativeSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <select className={cn(fieldClass, "h-9 py-1")} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Текст из поля → число или null; NaN значит «введено не число». */
function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(",", ".").replace(/\s/g, "");
  return trimmed === "" ? null : Number(trimmed);
}

export function PublicationDialog({
  projectId,
  open,
  onOpenChange,
  publication,
  initial,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Существующая публикация или null — новая */
  publication: PublicationFormData | null;
  initial: Draft;
}) {
  const [draft, setDraft] = useState<Draft>(publication ?? initial);
  const [numbers, setNumbers] = useState<Record<NumberKey, string>>(() => {
    const source = publication ?? initial;
    const keys = [...API_STATS, ...MANUAL_STATS].map((s) => s.key);
    return Object.fromEntries(keys.map((k) => [k, source[k] === null ? "" : String(source[k])])) as Record<NumberKey, string>;
  });
  const [labelsText, setLabelsText] = useState(draft.labels.join(", "));
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const readOnlyStats = publication?.fromInstagram ?? false;

  const run = (fn: () => Promise<ActionState>, close = true) =>
    startTransition(async () => {
      const result = await fn();
      notify(result);
      if (result?.ok && close) onOpenChange(false);
    });

  const save = () => {
    const parsed = Object.fromEntries(Object.entries(numbers).map(([k, v]) => [k, parseNumber(v)])) as Record<NumberKey, number | null>;
    const bad = [...API_STATS, ...MANUAL_STATS].find((s) => Number.isNaN(parsed[s.key]));
    if (bad) {
      notify({ ok: false, message: `«${bad.label}»: введите число` });
      return;
    }
    const labels = labelsText
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    run(() => savePublicationAction(projectId, publication?.id ?? null, { ...draft, ...parsed, labels }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{publication ? "Публикация" : "Новая публикация"}</DialogTitle>
          <DialogDescription>
            {publication?.scriptTitle ? `Из сценария «${publication.scriptTitle}». ` : ""}
            {readOnlyStats ? "Статистика подтягивается из Instagram." : "Статистику можно внести вручную."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pub-title">Название</Label>
            <Input id="pub-title" value={draft.title} maxLength={200} onChange={(e) => set("title", e.target.value)} placeholder="Как я начал вести блог" />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Дата</span>
              <input type="date" className={cn(fieldClass, "h-9 py-1")} value={draft.date ?? ""} onChange={(e) => set("date", e.target.value || null)} />
            </label>
            <NativeSelect label="Площадка" value={draft.platform} options={PLATFORMS} onChange={(v) => set("platform", v)} />
            <NativeSelect label="Тип" value={draft.type} options={PUBLICATION_TYPES} onChange={(v) => set("type", v)} />
            <NativeSelect label="Статус" value={draft.status} options={PUBLICATION_STATUSES} onChange={(v) => set("status", v)} />
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Текст к публикации</span>
            <textarea className={fieldClass} rows={4} maxLength={5000} value={draft.text} onChange={(e) => set("text", e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Заметка: сценарий, референс, ТЗ</span>
            <textarea className={fieldClass} rows={4} maxLength={10000} value={draft.note} onChange={(e) => set("note", e.target.value)} />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Кодовое слово</span>
              <Input value={draft.codeWord ?? ""} maxLength={50} onChange={(e) => set("codeWord", e.target.value || null)} placeholder="СТАРТ" />
            </label>
            <label className="grid gap-1.5 text-sm sm:col-span-2">
              <span className="font-medium">Метки через запятую</span>
              <Input value={labelsText} onChange={(e) => setLabelsText(e.target.value)} placeholder="рубрика, серия" />
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="flex items-center gap-2 font-medium">
              Ролик-референс из разведки
              {publication?.referenceUrl && (
                <a href={publication.referenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground underline">
                  {publication.referenceLabel} <ExternalLinkIcon className="size-3" />
                </a>
              )}
            </span>
            <Input value={draft.referenceUrl ?? ""} onChange={(e) => set("referenceUrl", e.target.value || null)} placeholder="https://www.instagram.com/reel/…" />
          </label>

          <fieldset className="grid gap-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              Статистика
              {publication?.statsUpdatedAt && (
                <span className="ml-2 font-normal text-muted-foreground">обновлено {formatDateTime(new Date(publication.statsUpdatedAt))}</span>
              )}
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {API_STATS.map((s) => (
                <NumberField key={s.key} label={s.label} value={numbers[s.key]} disabled={readOnlyStats} onChange={(v) => setNumbers((n) => ({ ...n, [s.key]: v }))} />
              ))}
              {readOnlyStats && publication?.avgWatchSec !== null && publication?.avgWatchSec !== undefined && (
                <NumberField label="Средний досмотр, сек" value={publication.avgWatchSec.toFixed(1)} disabled onChange={() => {}} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Вручную — то, что Instagram не отдаёт:</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MANUAL_STATS.map((s) => (
                <NumberField key={s.key} label={s.label} value={numbers[s.key]} onChange={(v) => setNumbers((n) => ({ ...n, [s.key]: v }))} />
              ))}
            </div>
            {publication?.permalink && (
              <a href={publication.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                Открыть в Instagram <ExternalLinkIcon className="size-3" />
              </a>
            )}
          </fieldset>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => set("isStar", !draft.isStar)} aria-pressed={draft.isStar}>
              <StarIcon className={cn(draft.isStar && "fill-amber-400 text-amber-500")} />
              {draft.isStar ? "Удачная" : "Отметить удачной"}
            </Button>
            {publication && (
              <>
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => repeatPublicationAction(projectId, publication.id))}>
                  <CopyIcon />
                  Повторить через неделю
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Удалить публикацию из плана?")) run(() => deletePublicationAction(projectId, publication.id));
                  }}
                >
                  <Trash2Icon />
                  Удалить
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={pending || !draft.title.trim()} onClick={save}>
              Сохранить
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input inputMode="decimal" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8 tabular-nums" />
    </label>
  );
}
