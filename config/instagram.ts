// Подключение Instagram (официальный API с входом через Instagram). Единственное место для этих настроек.
// Документация: developers.facebook.com/docs/instagram-platform (сверено 09.11.2026, версия v27.0).

export const INSTAGRAM_API = {
  authorizeUrl: "https://www.instagram.com/oauth/authorize",
  tokenUrl: "https://api.instagram.com/oauth/access_token",
  graphUrl: "https://graph.instagram.com",
  version: "v27.0",
};

/** Права: профиль и публикации, статистика, комментарии (для кодовых слов на этапе 5) */
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights", "instagram_business_manage_comments"];

export const INSTAGRAM_SYNC = {
  /** Сколько последних публикаций подтягивать за раз */
  mediaLimit: 50,
  /** Автоматически раз в N часов (по ежечасному cron) */
  everyHours: 24,
  /** Продлеваем доступ, когда до конца осталось меньше N дней (живёт 60 дней) */
  refreshWhenDaysLeft: 20,
};

/** Метрики публикации. Instagram отдаёт статистику с задержкой до 48 часов, пустой ответ ≠ 0. */
export const INSTAGRAM_METRICS = {
  reels: ["views", "reach", "likes", "comments", "saved", "shares", "ig_reels_avg_watch_time"],
  feed: ["views", "reach", "likes", "comments", "saved", "shares"],
};
