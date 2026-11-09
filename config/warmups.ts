// Прогревы: рубрики, смыслы, типы дней. Единственное место, где заданы их названия и цвета.
import type { Rubric, WarmupDayKind } from "@/lib/generated/prisma/enums";

export const RUBRICS: { value: Rubric; label: string; dot: string }[] = [
  { value: "LIFE", label: "Лайф", dot: "bg-amber-500" },
  { value: "CASE", label: "Кейс", dot: "bg-emerald-500" },
  { value: "EXPERT", label: "Экспертный", dot: "bg-sky-500" },
  { value: "OFFER", label: "Оффер", dot: "bg-rose-500" },
  { value: "THOUGHTS", label: "Мысли", dot: "bg-violet-500" },
  { value: "STORIES", label: "Сторис", dot: "bg-slate-500" },
];

export const MEANINGS: { value: string; label: string }[] = [
  { value: "PERSONALITY", label: "К личности" },
  { value: "PRODUCT", label: "К продукту" },
  { value: "TOPIC", label: "К теме" },
  { value: "EXPERTISE", label: "К экспертности" },
  { value: "FOMO", label: "ФОМО" },
  { value: "OPENNESS", label: "Открытость" },
];

export const MEANING_VALUES = MEANINGS.map((m) => m.value);

export const DAY_KINDS: { value: WarmupDayKind; label: string; className: string }[] = [
  { value: "START", label: "Старт прогрева", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { value: "LIVE", label: "Эфир", className: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  { value: "IMPORTANT", label: "Важный день", className: "bg-amber-500/20 text-amber-800 dark:text-amber-300" },
  { value: "OPEN_DAY", label: "День открытых дверей", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
];

/** Календарь прогрева показывает N месяцев от старта кампании */
export const WARMUP_CALENDAR_MONTHS = 3;

/** Самая длинная кампания, дней — укладывается в календарь на 3 месяца */
export const WARMUP_MAX_DAYS = 92;
