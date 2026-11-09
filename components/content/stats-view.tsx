"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, StarIcon } from "lucide-react";
import { shortDay } from "@/lib/content/dates";
import { engagementRate, type StatRow } from "@/lib/content/stats";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { notify } from "@/components/forms";
import { emptyDraft, PublicationDialog } from "@/components/content/publication-dialog";
import { loadPublicationAction, type PublicationFormData } from "@/app/(app)/p/[projectId]/content-plan/actions";

/** Открытие карточки публикации по клику — общее для графика и таблицы. */
function usePublicationDialog(projectId: string) {
  const [publication, setPublication] = useState<PublicationFormData | null>(null);
  const [, startTransition] = useTransition();
  const open = (id: string) =>
    startTransition(async () => {
      try {
        setPublication(await loadPublicationAction(projectId, id));
      } catch {
        notify({ ok: false, message: "Не удалось открыть публикацию. Обновите страницу." });
      }
    });
  const dialog = publication && (
    <PublicationDialog
      key={publication.id}
      projectId={projectId}
      open
      onOpenChange={(isOpen) => !isOpen && setPublication(null)}
      publication={publication}
      initial={emptyDraft(null)}
    />
  );
  return { open, dialog };
}

const CHART_HEIGHT = 220;
const BAR_GAP = 2;
const MAX_BAR = 28;

/** Просмотры по публикациям: столбики, линия медианы, звёзды на удачных. Клик открывает публикацию. */
export function ViewsChart({ projectId, rows, median }: { projectId: string; rows: StatRow[]; median: number | null }) {
  const { open, dialog } = usePublicationDialog(projectId);
  const [hover, setHover] = useState<number | null>(null);
  const bars = rows.filter((r) => r.views !== null);
  if (bars.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Нет просмотров за период — внесите их в карточках или подключите Instagram.</p>;
  }
  const max = Math.max(...bars.map((r) => r.views!), median ?? 0, 1);
  const slot = Math.min(MAX_BAR + BAR_GAP, 720 / bars.length);
  const width = Math.max(slot * bars.length, 320);
  const y = (value: number) => CHART_HEIGHT - (value / max) * (CHART_HEIGHT - 24);
  const active = hover === null ? null : bars[hover];

  return (
    <figure className="grid gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">Просмотры по публикациям</span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          {median !== null && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 border-t-2 border-dashed border-foreground/60" aria-hidden /> медиана {formatCount(median)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <StarIcon className="size-3 fill-amber-400 text-amber-500" aria-hidden /> удачная
          </span>
        </span>
      </figcaption>
      <div className="relative overflow-x-auto rounded-xl border p-3">
        <svg viewBox={`0 0 ${width} ${CHART_HEIGHT + 4}`} width={width} height={CHART_HEIGHT + 4} role="img" aria-label="Столбики просмотров по публикациям" className="block">
          <line x1={0} x2={width} y1={CHART_HEIGHT} y2={CHART_HEIGHT} className="stroke-border" strokeWidth={1} />
          {bars.map((row, i) => {
            const top = y(row.views!);
            const barWidth = slot - BAR_GAP;
            const x = i * slot;
            return (
              <g key={row.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => open(row.id)} className="cursor-pointer">
                <rect x={x} y={0} width={slot} height={CHART_HEIGHT} fill="transparent" />
                <path
                  d={`M${x},${CHART_HEIGHT} V${top + 4} q0,-4 4,-4 H${x + barWidth - 4} q4,0 4,4 V${CHART_HEIGHT} Z`}
                  className={cn("fill-sky-600 dark:fill-sky-400", hover !== null && hover !== i && "opacity-50")}
                />
                {row.isStar && (
                  <text x={x + barWidth / 2} y={Math.max(top - 4, 10)} textAnchor="middle" className="fill-amber-500 text-[10px]">
                    ★
                  </text>
                )}
              </g>
            );
          })}
          {median !== null && (
            <line x1={0} x2={width} y1={y(median)} y2={y(median)} strokeDasharray="4 3" strokeWidth={2} className="pointer-events-none stroke-foreground/60" />
          )}
        </svg>
        {active && (
          <div className="pointer-events-none absolute top-2 right-3 max-w-64 rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
            <p className="font-medium">{active.title}</p>
            <p className="text-muted-foreground">
              {shortDay(active.day)} · {formatCount(active.views!)} просм.{active.isStar ? " · удачная" : ""}
            </p>
          </div>
        )}
      </div>
      {dialog}
    </figure>
  );
}

type SortKey = "day" | "title" | "views" | "reach" | "likes" | "comments" | "saves" | "shares" | "er" | "follows";

const COLUMNS: { key: SortKey; label: string; value: (r: StatRow) => number | string | null }[] = [
  { key: "day", label: "Дата", value: (r) => r.day },
  { key: "title", label: "Публикация", value: (r) => r.title },
  { key: "views", label: "Просмотры", value: (r) => r.views },
  { key: "reach", label: "Охват", value: (r) => r.reach },
  { key: "likes", label: "Лайки", value: (r) => r.likes },
  { key: "comments", label: "Комм.", value: (r) => r.comments },
  { key: "saves", label: "Сохр.", value: (r) => r.saves },
  { key: "shares", label: "Репосты", value: (r) => r.shares },
  { key: "er", label: "ER, %", value: (r) => engagementRate(r) },
  { key: "follows", label: "Подписки", value: (r) => r.follows },
];

/** Таблица всех публикаций: сортировка по любому столбцу, лучшее значение столбца подсвечено. */
export function PublicationsTable({ projectId, rows }: { projectId: string; rows: StatRow[] }) {
  const { open, dialog } = usePublicationDialog(projectId);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "day", desc: true });

  const sorted = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sort.key)!;
    return [...rows].sort((a, b) => {
      const va = column.value(a);
      const vb = column.value(b);
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = typeof va === "string" ? va.localeCompare(String(vb), "ru") : va - (vb as number);
      return sort.desc ? -cmp : cmp;
    });
  }, [rows, sort]);

  const best = useMemo(() => {
    const result: Partial<Record<SortKey, number>> = {};
    for (const column of COLUMNS.slice(2)) {
      const values = rows.map(column.value).filter((v): v is number => typeof v === "number");
      if (values.length > 1) result[column.key] = Math.max(...values);
    }
    return result;
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[48rem] text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} className={cn("p-2 font-medium", column.key !== "day" && column.key !== "title" && "text-right")} aria-sort={sort.key === column.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => setSort((s) => ({ key: column.key, desc: s.key === column.key ? !s.desc : true }))}>
                  {column.label}
                  {sort.key === column.key && (sort.desc ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => open(row.id)}>
              {COLUMNS.map((column) => {
                const value = column.value(row);
                const numeric = typeof value === "number";
                return (
                  <td
                    key={column.key}
                    className={cn(
                      "p-2",
                      numeric && "text-right tabular-nums",
                      column.key === "day" && "whitespace-nowrap",
                      numeric && best[column.key] === value && "bg-emerald-500/10 font-semibold",
                    )}
                  >
                    {column.key === "day" && shortDay(row.day)}
                    {column.key === "title" && (
                      <span className="flex items-center gap-1">
                        {row.isStar && <StarIcon className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Удачная" />}
                        {row.title}
                      </span>
                    )}
                    {column.key !== "day" && column.key !== "title" && (value === null ? "—" : column.key === "er" ? (value as number).toFixed(1) : formatCount(value as number))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {dialog}
    </div>
  );
}

/** Топ-5 или слабые 5: короткий список с просмотрами. */
export function RankList({ projectId, title, rows }: { projectId: string; title: string; rows: StatRow[] }) {
  const { open, dialog } = usePublicationDialog(projectId);
  return (
    <section className="grid content-start gap-2 rounded-xl border p-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Мало данных.</p>
      ) : (
        <ol className="grid gap-1 text-sm">
          {rows.map((row, i) => (
            <li key={row.id}>
              <button type="button" onClick={() => open(row.id)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted">
                <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex-1 truncate">{row.title}</span>
                <span className="tabular-nums">{formatCount(row.views!)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {dialog}
    </section>
  );
}
