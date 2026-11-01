// Перевод ответов Apify в наши типы. Чистые функции — покрыты тестами.
import type { RunResult, ScrapedProfileData, ScrapedReelData, ScrapeFailure } from "./types";

type Json = Record<string, unknown>;

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function failureOf(item: Json): ScrapeFailure | null {
  const reason = str(item.error) ?? str(item.errorDescription);
  if (!reason) return null;
  const username = str(item.username) ?? str(item.ownerUsername) ?? usernameFromUrl(str(item.inputUrl)) ?? "?";
  return { username: username.toLowerCase(), reason };
}

export function usernameFromUrl(url: string | null): string | null {
  const match = url?.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  return match && !["p", "reel", "reels"].includes(match[1]) ? match[1].toLowerCase() : null;
}

/** Ролик из instagram-reel-scraper. Просмотры — videoPlayCount: эту цифру показывает Instagram. */
export function normalizeReel(item: Json): ScrapedReelData | null {
  const shortCode = str(item.shortCode);
  const username = str(item.ownerUsername);
  const timestamp = str(item.timestamp);
  const views = num(item.videoPlayCount) ?? num(item.videoViewCount);
  if (!shortCode || !username || !timestamp || views === null) return null;

  const music = (item.musicInfo ?? {}) as Json;
  return {
    shortCode,
    username: username.toLowerCase(),
    url: str(item.url) ?? `https://www.instagram.com/reel/${shortCode}/`,
    postedAt: new Date(timestamp),
    caption: str(item.caption),
    views,
    likes: num(item.likesCount),
    comments: num(item.commentsCount),
    durationSec: num(item.videoDuration),
    videoUrl: str(item.videoUrl),
    coverUrl: str(item.displayUrl),
    musicTitle: music.uses_original_audio ? null : str(music.song_name),
    musicArtist: music.uses_original_audio ? null : str(music.artist_name),
    hashtags: Array.isArray(item.hashtags) ? item.hashtags.filter((h): h is string => typeof h === "string") : [],
    isPinned: item.isPinned === true,
    fullName: str(item.ownerFullName),
  };
}

export function normalizeProfile(item: Json): ScrapedProfileData | null {
  const username = str(item.username);
  if (!username) return null;
  return {
    username: username.toLowerCase(),
    fullName: str(item.fullName),
    avatarUrl: str(item.profilePicUrlHD) ?? str(item.profilePicUrl),
    followers: num(item.followersCount),
  };
}

export function normalizeReelsRun(items: Json[]): RunResult {
  const result: RunResult = { reels: [], profiles: [], failures: [] };
  for (const item of items) {
    const failure = failureOf(item);
    if (failure) result.failures.push(failure);
    else {
      const reel = normalizeReel(item);
      if (reel) result.reels.push(reel);
    }
  }
  return result;
}

export function normalizeProfilesRun(items: Json[]): RunResult {
  const result: RunResult = { reels: [], profiles: [], failures: [] };
  for (const item of items) {
    const failure = failureOf(item);
    if (failure) result.failures.push(failure);
    else {
      const profile = normalizeProfile(item);
      if (profile) result.profiles.push(profile);
    }
  }
  return result;
}
