"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, StickyNoteIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/forms";
import { createBoardItemAction, deleteBoardItemAction, updateBoardItemAction, type BoardItemView } from "@/app/(app)/p/[projectId]/work-actions";

const COLORS: Record<string, string> = {
  amber: "bg-amber-100 border-amber-300 dark:bg-amber-900/50 dark:border-amber-700",
  sky: "bg-sky-100 border-sky-300 dark:bg-sky-900/50 dark:border-sky-700",
  emerald: "bg-emerald-100 border-emerald-300 dark:bg-emerald-900/50 dark:border-emerald-700",
  rose: "bg-rose-100 border-rose-300 dark:bg-rose-900/50 dark:border-rose-700",
  violet: "bg-violet-100 border-violet-300 dark:bg-violet-900/50 dark:border-violet-700",
  slate: "bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-600",
};

type Drag = { id: string; mode: "move" | "resize"; startX: number; startY: number; orig: BoardItemView };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Свободное полотно прогрева: стикеры и картинки. Перетаскивание — за край, размер — за уголок, текст — двойной щелчок. */
export function WarmupBoard({ projectId, campaignId, initial, size, canEdit }: { projectId: string; campaignId: string; initial: BoardItemView[]; size: { width: number; height: number }; canEdit: boolean }) {
  const [items, setItems] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  const patchLocal = (id: string, patch: Partial<BoardItemView>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const save = (id: string, patch: Partial<Pick<BoardItemView, "x" | "y" | "width" | "height" | "text" | "color">>) =>
    startTransition(async () => {
      const result = await updateBoardItemAction(projectId, id, patch as never);
      if (!result?.ok) notify(result);
    });

  const add = (kind: "STICKY" | "IMAGE") => {
    let imageUrl: string | null = null;
    if (kind === "IMAGE") {
      imageUrl = window.prompt("Ссылка на картинку (https://…)")?.trim() || null;
      if (!imageUrl) return;
    }
    const view = scroller.current;
    const x = clamp(Math.round((view?.scrollLeft ?? 0) + 40 + items.length * 12) % size.width, 0, size.width - 220);
    const y = clamp(Math.round((view?.scrollTop ?? 0) + 40 + items.length * 12), 0, size.height - 160);
    startTransition(async () => {
      const result = await createBoardItemAction(projectId, campaignId, { kind, x, y, width: kind === "IMAGE" ? 280 : 200, height: kind === "IMAGE" ? 200 : 140, text: "", imageUrl });
      if (!result?.ok || !result.item) {
        notify(result);
        return;
      }
      setItems((list) => [...list, result.item!]);
      setSelected(result.item.id);
      if (kind === "STICKY") setEditing(result.item.id);
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteBoardItemAction(projectId, id);
      if (result?.ok) {
        setItems((list) => list.filter((i) => i.id !== id));
        setSelected(null);
      } else notify(result);
    });

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.mode === "move") {
      patchLocal(drag.id, { x: clamp(drag.orig.x + dx, 0, size.width - drag.orig.width), y: clamp(drag.orig.y + dy, 0, size.height - drag.orig.height) });
    } else {
      patchLocal(drag.id, { width: clamp(drag.orig.width + dx, 80, 800), height: clamp(drag.orig.height + dy, 60, 800) });
    }
  };

  const onPointerUp = () => {
    if (!drag) return;
    const item = items.find((i) => i.id === drag.id);
    setDrag(null);
    if (!item) return;
    if (drag.mode === "move" && (item.x !== drag.orig.x || item.y !== drag.orig.y)) save(item.id, { x: item.x, y: item.y });
    if (drag.mode === "resize" && (item.width !== drag.orig.width || item.height !== drag.orig.height)) save(item.id, { width: item.width, height: item.height });
  };

  const start = (e: React.PointerEvent, item: BoardItemView, mode: Drag["mode"]) => {
    if (!canEdit || editing === item.id) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelected(item.id);
    setDrag({ id: item.id, mode, startX: e.clientX, startY: e.clientY, orig: item });
  };

  const current = items.find((i) => i.id === selected);

  return (
    <div className="grid gap-2">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => add("STICKY")}>
            <StickyNoteIcon />
            Стикер
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => add("IMAGE")}>
            <ImageIcon />
            Картинка по ссылке
          </Button>
          {current && (
            <>
              <span className="ml-2 text-xs text-muted-foreground">Выбрано:</span>
              {current.kind === "STICKY" &&
                Object.keys(COLORS).map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Цвет ${color}`}
                    className={cn("size-6 rounded-full border-2", COLORS[color], current.color === color && "ring-2 ring-ring")}
                    onClick={() => {
                      patchLocal(current.id, { color });
                      save(current.id, { color });
                    }}
                  />
                ))}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(current.id)}>
                <Trash2Icon />
                Удалить
              </Button>
            </>
          )}
        </div>
      )}
      <div ref={scroller} className="h-[70svh] overflow-auto rounded-xl border bg-muted/20">
        <div
          className="relative touch-none"
          style={{ width: size.width, height: size.height, backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerDown={() => {
            setSelected(null);
            setEditing(null);
          }}
        >
          {items.length === 0 && (
            <p className="absolute top-8 left-8 text-sm text-muted-foreground">
              Пустая доска. {canEdit ? "Добавьте стикер с идеей или картинку-референс." : ""}
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "absolute flex flex-col overflow-hidden rounded-lg border shadow-sm",
                item.kind === "STICKY" ? COLORS[item.color] ?? COLORS.amber : "bg-background",
                selected === item.id && "ring-2 ring-primary",
                canEdit && editing !== item.id && "cursor-grab active:cursor-grabbing",
              )}
              style={{ left: item.x, top: item.y, width: item.width, height: item.height }}
              onPointerDown={(e) => start(e, item, "move")}
              onDoubleClick={() => canEdit && item.kind === "STICKY" && setEditing(item.id)}
            >
              {item.kind === "IMAGE" && item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- внешние картинки по ссылке, без оптимизации Next
                <img src={item.imageUrl} alt="" referrerPolicy="no-referrer" draggable={false} className="pointer-events-none size-full object-cover" />
              ) : editing === item.id ? (
                <textarea
                  autoFocus
                  aria-label="Текст стикера"
                  className="size-full resize-none bg-transparent p-2 text-sm outline-none"
                  defaultValue={item.text}
                  maxLength={1000}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    setEditing(null);
                    if (e.target.value !== item.text) {
                      patchLocal(item.id, { text: e.target.value });
                      save(item.id, { text: e.target.value });
                    }
                  }}
                />
              ) : (
                <p className="size-full overflow-hidden p-2 text-sm whitespace-pre-wrap select-none">{item.text || (canEdit ? "Двойной щелчок — написать" : "")}</p>
              )}
              {canEdit && (
                <span
                  aria-hidden
                  className="absolute right-0 bottom-0 size-3 cursor-se-resize rounded-tl bg-foreground/30"
                  onPointerDown={(e) => start(e, item, "resize")}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Двигайте за любое место, размер — за уголок справа внизу, текст — двойной щелчок. Всё сохраняется само.</p>
    </div>
  );
}
