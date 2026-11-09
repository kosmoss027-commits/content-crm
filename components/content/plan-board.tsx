"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { PlusIcon, StarIcon } from "lucide-react";
import type { Platform, PublicationStatus, PublicationType } from "@/lib/generated/prisma/enums";
import { PLATFORMS, PUBLICATION_STATUSES, PUBLICATION_TYPES } from "@/config/content";
import { shortDay, WEEKDAY_LABELS } from "@/lib/content/dates";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/forms";
import { emptyDraft, PublicationDialog } from "@/components/content/publication-dialog";
import { loadPublicationAction, movePublicationAction, type PublicationFormData } from "@/app/(app)/p/[projectId]/content-plan/actions";

export type BoardItem = {
  id: string;
  title: string;
  day: string | null;
  platform: Platform;
  type: PublicationType;
  status: PublicationStatus;
  isStar: boolean;
  views: number | null;
  codeWord: string | null;
};

export type BoardView = "week" | "month" | "list";

const TYPE_COLOR = Object.fromEntries(PUBLICATION_TYPES.map((t) => [t.value, t.color])) as Record<PublicationType, string>;
const TYPE_LABEL = Object.fromEntries(PUBLICATION_TYPES.map((t) => [t.value, t.label])) as Record<PublicationType, string>;
const STATUS_LABEL = Object.fromEntries(PUBLICATION_STATUSES.map((s) => [s.value, s.label])) as Record<PublicationStatus, string>;
const PLATFORM_LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label])) as Record<Platform, string>;

type DialogState = { open: false } | { open: true; publication: PublicationFormData | null; day: string | null; platform: Platform };

export function PlanBoard({
  projectId,
  view,
  days,
  monthDays,
  today,
  items,
  undated,
  canEdit,
  openNewOnLoad = false,
}: {
  projectId: string;
  /** Пришли по кнопке «+ Публикация» в шапке — сразу открыть форму */
  openNewOnLoad?: boolean;
  view: BoardView;
  /** Дни недели (7) для вида «неделя» */
  days: string[];
  /** Дни сетки месяца (кратно 7), с соседними месяцами по краям; для вида «месяц» */
  monthDays: { day: string; inMonth: boolean }[];
  today: string;
  items: BoardItem[];
  undated: BoardItem[];
  canEdit: boolean;
}) {
  const all = useMemo(() => [...items, ...undated], [items, undated]);
  // Перенос виден сразу; после ответа сервера план приходит заново, при ошибке карточка вернётся на место
  const [local, applyMove] = useOptimistic(all, (state, move: { id: string; day: string | null; platform?: Platform }) =>
    state.map((i) => (i.id === move.id ? { ...i, day: move.day, platform: move.platform ?? i.platform } : i)),
  );
  const [dialog, setDialog] = useState<DialogState>(() =>
    openNewOnLoad && canEdit ? { open: true, publication: null, day: today, platform: "INSTAGRAM" } : { open: false },
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const openExisting = (id: string) =>
    startTransition(async () => {
      try {
        const publication = await loadPublicationAction(projectId, id);
        setDialog({ open: true, publication, day: publication.date, platform: publication.platform });
      } catch {
        notify({ ok: false, message: "Не удалось открыть публикацию. Обновите страницу." });
      }
    });

  const openNew = (day: string | null, platform: Platform = "INSTAGRAM") => setDialog({ open: true, publication: null, day, platform });

  const drop = (day: string | null, platform?: Platform) => {
    const id = dragId;
    setDragId(null);
    if (!id || !canEdit) return;
    const item = local.find((i) => i.id === id);
    if (!item || (item.day === day && (!platform || item.platform === platform))) return;
    startTransition(async () => {
      applyMove({ id, day, platform });
      const result = await movePublicationAction(projectId, id, { date: day, ...(platform ? { platform } : {}) });
      if (!result?.ok) notify(result);
    });
  };

  const dropZone = (day: string | null, platform?: Platform) =>
    canEdit
      ? {
          onDragOver: (e: React.DragEvent) => e.preventDefault(),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            drop(day, platform);
          },
        }
      : {};

  const card = (item: BoardItem, compact = false) => (
    <PlanCard
      key={item.id}
      item={item}
      compact={compact}
      draggable={canEdit}
      dragging={dragId === item.id}
      onDragStart={() => setDragId(item.id)}
      onDragEnd={() => setDragId(null)}
      onOpen={() => openExisting(item.id)}
    />
  );

  const dated = local.filter((i) => i.day !== null);
  const ideas = local.filter((i) => i.day === null);

  return (
    <>
      {view === "week" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="w-28 border-b p-2 text-left font-medium text-muted-foreground">Площадка</th>
                {days.map((day, i) => (
                  <th key={day} className={cn("border-b border-l p-2 text-left font-medium", day === today && "bg-primary/10")}>
                    {WEEKDAY_LABELS[i]} <span className="font-normal text-muted-foreground">{shortDay(day)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLATFORMS.map((platform) => (
                <tr key={platform.value} className="align-top">
                  <th scope="row" className="border-b p-2 text-left text-xs font-medium text-muted-foreground">
                    {platform.label}
                  </th>
                  {days.map((day) => (
                    <td key={day} className={cn("group h-24 border-b border-l p-1", day === today && "bg-primary/5")} {...dropZone(day, platform.value)}>
                      <div className="grid gap-1">
                        {dated.filter((i) => i.day === day && i.platform === platform.value).map((i) => card(i, true))}
                        {canEdit && <AddButton onClick={() => openNew(day, platform.value)} label={`Добавить: ${platform.label}, ${shortDay(day)}`} />}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "month" && (
        <div className="overflow-x-auto rounded-xl border">
          <div className="grid min-w-[48rem] grid-cols-7 text-sm">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="border-b bg-muted/40 p-2 font-medium">
                {label}
              </div>
            ))}
            {monthDays.map(({ day, inMonth }) => (
              <div
                key={day}
                className={cn("group grid min-h-28 content-start gap-1 border-b border-l p-1 first:border-l-0 [&:nth-child(7n+1)]:border-l-0", !inMonth && "bg-muted/30 text-muted-foreground", day === today && "bg-primary/5")}
                {...dropZone(day)}
              >
                <span className={cn("px-1 text-xs tabular-nums", day === today && "font-semibold text-primary")}>{Number(day.slice(8))}</span>
                {dated.filter((i) => i.day === day).map((i) => card(i, true))}
                {canEdit && <AddButton onClick={() => openNew(day)} label={`Добавить на ${shortDay(day)}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "list" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2 font-medium">Дата</th>
                <th className="p-2 font-medium">Название</th>
                <th className="p-2 font-medium">Площадка</th>
                <th className="p-2 font-medium">Тип</th>
                <th className="p-2 font-medium">Статус</th>
                <th className="p-2 text-right font-medium">Просмотры</th>
              </tr>
            </thead>
            <tbody>
              {local.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Публикаций нет. Добавьте первую кнопкой «Публикация».
                  </td>
                </tr>
              )}
              {local.map((item) => (
                <tr key={item.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => openExisting(item.id)}>
                  <td className="p-2 whitespace-nowrap tabular-nums">{item.day ? shortDay(item.day) : "без даты"}</td>
                  <td className="p-2">
                    <span className="flex items-center gap-1">
                      {item.isStar && <StarIcon className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Удачная" />}
                      {item.title}
                    </span>
                  </td>
                  <td className="p-2">{PLATFORM_LABEL[item.platform]}</td>
                  <td className="p-2">{TYPE_LABEL[item.type]}</td>
                  <td className="p-2">
                    <Badge variant="secondary">{STATUS_LABEL[item.status]}</Badge>
                  </td>
                  <td className="p-2 text-right tabular-nums">{item.views === null ? "—" : formatCount(item.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view !== "list" && (
        <section className={cn("mt-4 grid gap-2 rounded-xl border border-dashed p-3", dragId && "border-primary")} {...dropZone(null)} aria-label="Идеи без даты">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">
              Без даты <span className="font-normal text-muted-foreground">— перетащите в нужный день</span>
            </h2>
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => openNew(null)}>
                <PlusIcon />
                Идея
              </Button>
            )}
          </div>
          {ideas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Пусто. Сюда же попадают сценарии из раздела «Сегодня».</p>
          ) : (
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">{ideas.map((i) => card(i))}</div>
          )}
        </section>
      )}

      {dialog.open && (
        <PublicationDialog
          key={dialog.publication?.id ?? `new-${dialog.day}-${dialog.platform}`}
          projectId={projectId}
          open
          onOpenChange={(open) => !open && setDialog({ open: false })}
          publication={dialog.publication}
          initial={emptyDraft(dialog.day, dialog.platform)}
        />
      )}

      <NewPublicationTrigger onOpen={() => openNew(today)} />
    </>
  );
}

/** Кнопка «Публикация» в шапке страницы открывает форму через событие. */
function NewPublicationTrigger({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const handler = () => onOpen();
    window.addEventListener("content-plan:new", handler);
    return () => window.removeEventListener("content-plan:new", handler);
  }, [onOpen]);
  return null;
}

/** Фильтры плана: площадка, тип, статус, метка — в адресе страницы, применяются сразу. */
export function PlanFilters({ labels, values }: { labels: string[]; values: Record<"platform" | "type" | "status" | "label", string> }) {
  const groups: { name: keyof typeof values; placeholder: string; options: { value: string; label: string }[] }[] = [
    { name: "platform", placeholder: "Все площадки", options: PLATFORMS },
    { name: "type", placeholder: "Все типы", options: PUBLICATION_TYPES },
    { name: "status", placeholder: "Все статусы", options: PUBLICATION_STATUSES },
    { name: "label", placeholder: "Все метки", options: labels.map((l) => ({ value: l, label: l })) },
  ];
  const change = (name: string, value: string) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
    window.location.assign(url.toString());
  };
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтры">
      {groups
        .filter((g) => g.options.length > 0)
        .map((g) => (
          <select
            key={g.name}
            aria-label={g.placeholder}
            value={values[g.name]}
            onChange={(e) => change(g.name, e.target.value)}
            className={cn("h-8 rounded-md border bg-transparent px-2 text-sm", values[g.name] && "border-primary")}
          >
            <option value="">{g.placeholder}</option>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
    </div>
  );
}

export function NewPublicationButton() {
  return (
    <Button size="sm" onClick={() => window.dispatchEvent(new Event("content-plan:new"))}>
      <PlusIcon />
      Публикация
    </Button>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
    >
      <PlusIcon className="size-3.5" />
    </button>
  );
}

function PlanCard({
  item,
  compact,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  item: BoardItem;
  compact: boolean;
  draggable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      title={`${item.title} — ${TYPE_LABEL[item.type]}, ${STATUS_LABEL[item.status]}`}
      className={cn(
        "grid w-full gap-0.5 rounded-md border border-l-4 px-2 py-1 text-left text-xs shadow-xs transition-opacity hover:ring-2 hover:ring-ring/30",
        TYPE_COLOR[item.type],
        draggable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
        item.status === "PUBLISHED" && "opacity-80",
      )}
    >
      <span className="flex items-start gap-1 font-medium">
        {item.isStar && <StarIcon className="mt-0.5 size-3 shrink-0 fill-amber-400 text-amber-500" aria-label="Удачная" />}
        <span className={cn(compact && "line-clamp-2")}>{item.title}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
        <span>{STATUS_LABEL[item.status]}</span>
        {item.codeWord && <span>«{item.codeWord}»</span>}
        {item.views !== null && <span className="tabular-nums">{formatCount(item.views)} просм.</span>}
      </span>
    </button>
  );
}
