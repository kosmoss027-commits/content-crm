// Статистика контента: чистые функции без базы — периоды, плитки, лучший день, топ и слабые публикации.
import { STATS_TOP_N } from "@/config/content";
import { addDays, addMonths, daysBetween, isDay, monthEnd, monthStart, weekdayIndex } from "@/lib/content/dates";

export type StatRow = {
  id: string;
  title: string;
  day: string;
  platform: string;
  type: string;
  isStar: boolean;
  permalink: string | null;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  avgWatchSec: number | null;
  profileVisits: number | null;
  linkClicks: number | null;
  follows: number | null;
  coldAudiencePct: number | null;
};

export const PERIODS = [
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
  { value: "month", label: "Этот месяц" },
  { value: "prev-month", label: "Прошлый месяц" },
  { value: "all", label: "Всё время" },
  { value: "custom", label: "Свой период" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["value"];
export type DayRange = { from: string; to: string };
export type Period = { key: PeriodKey; current: DayRange | null; previous: DayRange | null };

/** Период и такой же по длине предыдущий — для стрелок ↑/↓. «Всё время» не сравнивается. */
export function resolvePeriod(key: string | undefined, today: string, custom: { from?: string; to?: string } = {}): Period {
  const shift = (range: DayRange): DayRange => {
    const length = daysBetween(range.from, range.to) + 1;
    return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
  };
  switch (key) {
    case "90d": {
      const current = { from: addDays(today, -89), to: today };
      return { key, current, previous: shift(current) };
    }
    case "month": {
      const current = { from: monthStart(today), to: today };
      const prevStart = addMonths(today, -1);
      const sameDay = addDays(prevStart, daysBetween(current.from, today));
      return { key, current, previous: { from: prevStart, to: sameDay > monthEnd(prevStart) ? monthEnd(prevStart) : sameDay } };
    }
    case "prev-month": {
      const start = addMonths(today, -1);
      const before = addMonths(today, -2);
      return { key, current: { from: start, to: monthEnd(start) }, previous: { from: before, to: monthEnd(before) } };
    }
    case "all":
      return { key, current: null, previous: null };
    case "custom": {
      if (custom.from && custom.to && isDay(custom.from) && isDay(custom.to) && custom.from <= custom.to) {
        const current = { from: custom.from, to: custom.to };
        return { key, current, previous: shift(current) };
      }
      break;
    }
  }
  const current = { from: addDays(today, -29), to: today };
  return { key: "30d", current, previous: shift(current) };
}

const sum = (values: (number | null)[]): number | null => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};

const mean = (values: (number | null)[]): number | null => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Вовлечённость, %: (лайки + комментарии + сохранения + репосты) / охват (или просмотры, если охвата нет). */
export function engagementRate(row: StatRow): number | null {
  const base = row.reach ?? row.views;
  if (!base) return null;
  const actions = [row.likes, row.comments, row.saves, row.shares];
  if (actions.every((v) => v === null)) return null;
  return (actions.reduce<number>((a, v) => a + (v ?? 0), 0) / base) * 100;
}

export const TILES = [
  { key: "publications", label: "Публикации", format: "count" },
  { key: "views", label: "Просмотры", format: "count" },
  { key: "avgViews", label: "Средние просмотры", format: "count" },
  { key: "medianViews", label: "Медиана просмотров", format: "count" },
  { key: "reach", label: "Охват", format: "count" },
  { key: "er", label: "Вовлечённость (ER)", format: "percent" },
  { key: "savesShares", label: "Сохранения и репосты", format: "count" },
  { key: "avgWatch", label: "Средний досмотр Reels", format: "seconds" },
  { key: "profileVisits", label: "Посещения профиля", format: "count" },
  { key: "linkClicks", label: "Переходы по ссылке", format: "count" },
  { key: "follows", label: "Подписки", format: "count" },
  { key: "coldAudience", label: "Холодная аудитория", format: "percent" },
] as const;

export type TileKey = (typeof TILES)[number]["key"];
export type TileValues = Record<TileKey, number | null>;

export function computeTiles(rows: StatRow[]): TileValues {
  const views = rows.map((r) => r.views);
  const knownViews = views.filter((v): v is number => v !== null);
  return {
    publications: rows.length,
    views: sum(views),
    avgViews: mean(views),
    medianViews: median(knownViews),
    reach: sum(rows.map((r) => r.reach)),
    er: mean(rows.map(engagementRate)),
    savesShares: sum(rows.flatMap((r) => [r.saves, r.shares])),
    avgWatch: mean(rows.map((r) => r.avgWatchSec)),
    profileVisits: sum(rows.map((r) => r.profileVisits)),
    linkClicks: sum(rows.map((r) => r.linkClicks)),
    follows: sum(rows.map((r) => r.follows)),
    coldAudience: mean(rows.map((r) => r.coldAudiencePct)),
  };
}

/** Изменение к прошлому периоду, %. null — сравнивать не с чем. */
export function changePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Лучший день недели по средним просмотрам (0 — понедельник). */
export function bestWeekday(rows: StatRow[]): { weekday: number; avgViews: number; count: number } | null {
  const buckets = new Map<number, number[]>();
  for (const row of rows) {
    if (row.views === null) continue;
    const weekday = weekdayIndex(row.day);
    buckets.set(weekday, [...(buckets.get(weekday) ?? []), row.views]);
  }
  let best: { weekday: number; avgViews: number; count: number } | null = null;
  for (const [weekday, values] of buckets) {
    const avgViews = values.reduce((a, b) => a + b, 0) / values.length;
    if (!best || avgViews > best.avgViews) best = { weekday, avgViews, count: values.length };
  }
  return best;
}

/** Топ и слабые публикации по просмотрам; одна публикация не попадает в оба списка. */
export function topAndBottom(rows: StatRow[], n = STATS_TOP_N): { top: StatRow[]; bottom: StatRow[] } {
  const sorted = rows.filter((r) => r.views !== null).sort((a, b) => b.views! - a.views!);
  const top = sorted.slice(0, n);
  const bottom = sorted.slice(Math.max(n, sorted.length - n)).reverse();
  return { top, bottom };
}

const CSV_COLUMNS: { header: string; value: (r: StatRow) => string | number | null }[] = [
  { header: "Дата", value: (r) => r.day },
  { header: "Название", value: (r) => r.title },
  { header: "Площадка", value: (r) => r.platform },
  { header: "Тип", value: (r) => r.type },
  { header: "Удачная", value: (r) => (r.isStar ? "да" : "") },
  { header: "Просмотры", value: (r) => r.views },
  { header: "Охват", value: (r) => r.reach },
  { header: "Лайки", value: (r) => r.likes },
  { header: "Комментарии", value: (r) => r.comments },
  { header: "Сохранения", value: (r) => r.saves },
  { header: "Репосты", value: (r) => r.shares },
  { header: "ER, %", value: (r) => engagementRate(r)?.toFixed(2) ?? null },
  { header: "Досмотр, сек", value: (r) => r.avgWatchSec },
  { header: "Посещения профиля", value: (r) => r.profileVisits },
  { header: "Переходы", value: (r) => r.linkClicks },
  { header: "Подписки", value: (r) => r.follows },
  { header: "Холодная аудитория, %", value: (r) => r.coldAudiencePct },
  { header: "Ссылка", value: (r) => r.permalink },
];

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  // Защита от формул в Excel и экранирование кавычек
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV для Excel: разделитель «;», BOM для кириллицы. */
export function toCsv(rows: StatRow[]): string {
  const lines = [CSV_COLUMNS.map((c) => c.header), ...rows.map((r) => CSV_COLUMNS.map((c) => csvCell(c.value(r))))];
  return `﻿${lines.map((cells) => cells.join(";")).join("\r\n")}`;
}
