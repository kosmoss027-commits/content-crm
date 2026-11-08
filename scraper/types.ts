// Модуль сбора чужих роликов. Остальное приложение знает только эти типы,
// поэтому провайдера (сейчас Apify) можно заменить, не трогая логику разведки.

export type ScrapedReelData = {
  shortCode: string;
  username: string;
  url: string;
  postedAt: Date;
  caption: string | null;
  views: number;
  likes: number | null;
  comments: number | null;
  durationSec: number | null;
  videoUrl: string | null;
  coverUrl: string | null;
  musicTitle: string | null;
  musicArtist: string | null;
  hashtags: string[];
  isPinned: boolean;
  fullName: string | null;
};

export type ScrapedProfileData = {
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  followers: number | null;
};

/** Аккаунт, который сборщик не смог собрать (закрыт, ограничен, не существует). */
export type ScrapeFailure = { username: string; reason: string };

export type ReelsRequest = {
  usernames: string[];
  /** Только ролики новее этой даты */
  newerThan?: Date;
  /** Не больше N роликов на аккаунт */
  limitPerAccount?: number;
  maxCostUsd: number;
  webhookUrl?: string;
};

export type ProfilesRequest = { usernames: string[]; maxCostUsd: number; webhookUrl?: string };

export type RunKind = "reels" | "profiles";

export type RunState = {
  status: "running" | "succeeded" | "failed";
  costUsd: number;
  error: string | null;
};

export type RunResult = {
  reels: ScrapedReelData[];
  profiles: ScrapedProfileData[];
  failures: ScrapeFailure[];
};

export interface ScraperProvider {
  startReels(request: ReelsRequest): Promise<string>;
  startProfiles(request: ProfilesRequest): Promise<string>;
  getRunState(runId: string): Promise<RunState>;
  getRunResult(runId: string, kind: RunKind): Promise<RunResult>;
  /** Свежие данные роликов по ссылкам (ссылки на видео Instagram живут несколько дней). Синхронно. */
  fetchReelsByUrl(urls: string[], maxCostUsd: number): Promise<ScrapedReelData[]>;
}
