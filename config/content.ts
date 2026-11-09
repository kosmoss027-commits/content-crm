// Контент-план: площадки, типы, статусы, цвета. Единственное место, где они задаются.
import type { Platform, PublicationStatus, PublicationType } from "@/lib/generated/prisma/enums";

/** Часовой пояс, в котором считается «сегодня» и дни недели в плане */
export const PLAN_TIME_ZONE = "Asia/Almaty";

export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "STORIES", label: "Сторис" },
  { value: "THREADS", label: "Threads" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "YOUTUBE", label: "YouTube" },
];

/** Цвет карточки по типу: фон и полоска слева (классы Tailwind) */
export const PUBLICATION_TYPES: { value: PublicationType; label: string; color: string }[] = [
  { value: "SALES", label: "Продающий / прогрев", color: "border-l-rose-500 bg-rose-50 dark:bg-rose-950/40" },
  { value: "ENGAGING", label: "Вовлекающий / лайф", color: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/40" },
  { value: "EXPERT", label: "Экспертный", color: "border-l-sky-500 bg-sky-50 dark:bg-sky-950/40" },
  { value: "CASE", label: "Кейс / отзыв", color: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" },
  { value: "ANNOUNCE", label: "Анонс / эфир", color: "border-l-violet-500 bg-violet-50 dark:bg-violet-950/40" },
];

export const PUBLICATION_STATUSES: { value: PublicationStatus; label: string }[] = [
  { value: "IDEA", label: "Идея" },
  { value: "SCRIPT", label: "Сценарий" },
  { value: "SHOOT", label: "Съёмка" },
  { value: "EDIT", label: "Монтаж" },
  { value: "READY", label: "Готово" },
  { value: "PUBLISHED", label: "Опубликовано" },
];

/** «Повторить через неделю» сдвигает дату на N дней */
export const REPEAT_AFTER_DAYS = 7;

/** Сколько лучших и слабых публикаций показывать в статистике */
export const STATS_TOP_N = 5;
