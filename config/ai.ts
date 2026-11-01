// Разбор роликов и сценарии: модели, цены и лимиты. Единственное место, где они задаются.

export const AI_MODELS = {
  /** Дешёвая проверка «полезен ли ролик проекту» */
  relevance: "claude-haiku-5-5",
  /** Полный разбор ролика */
  analysis: "claude-opus-5-5",
  /** Сценарии и правки */
  script: "claude-opus-5-5",
} as const;

/** Цены Claude, $ за 1 млн токенов (проверено 01.11.2026) */
export const CLAUDE_PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** Расшифровка речи Deepgram Nova-3, $ за минуту аудио */
export const TRANSCRIPT_PRICE_PER_MINUTE = 0.0043;

export const AI_LIMITS = {
  /** Потолок расходов на ИИ (Claude + расшифровка) за календарный месяц, $ */
  monthlyUsd: 10,
  /** Не больше N полных разборов в сутки на всю систему */
  analysesPerDay: 15,
  /** Сколько черновиков сценариев готовить каждому проекту каждое утро */
  dailyDraftsPerProject: 3,
  /** В очередь берём залёты не старше N дней */
  queueMaxAgeDays: 120,
};

/** Утренние черновики — после этого часа (часовой пояс как у сбора, config/scraping.ts) */
export const DAILY_DRAFTS_HOUR = 9;
