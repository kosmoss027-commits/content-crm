// Медиана, множитель и рейтинг аккаунта. Чистые функции — покрыты тестами.
import { accountRating } from "@/config/scoring";
import { DEFAULT_VIRAL_THRESHOLD, MEDIAN_SAMPLE } from "@/config/scraping";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_REELS_FOR_MEDIAN = 3;

export type ReelPoint = { id: string; views: number; postedAt: Date };

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Медиана по последним роликам, которые уже успели набрать просмотры. */
export function accountMedian(reels: ReelPoint[], now: Date): number | null {
  const cutoff = now.getTime() - MEDIAN_SAMPLE.minAgeDays * DAY_MS;
  const sample = reels
    .filter((reel) => reel.postedAt.getTime() <= cutoff)
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
    .slice(0, MEDIAN_SAMPLE.reels);
  if (sample.length < MIN_REELS_FOR_MEDIAN) return null;
  return median(sample.map((reel) => reel.views));
}

export function multiplierOf(views: number, medianViews: number | null): number | null {
  if (!medianViews || medianViews <= 0) return null;
  return Math.round((views / medianViews) * 100) / 100;
}

export type AccountStats = {
  medianViews: number | null;
  reelsCount: number;
  viralCount: number;
  avgViralMultiplier: number | null;
  rating: number | null;
  multipliers: Map<string, number | null>;
};

export function computeAccountStats(
  reels: ReelPoint[],
  now: Date,
  viralThreshold = DEFAULT_VIRAL_THRESHOLD,
): AccountStats {
  const medianValue = accountMedian(reels, now);
  const medianViews = medianValue === null ? null : Math.round(medianValue);
  const multipliers = new Map(reels.map((reel) => [reel.id, multiplierOf(reel.views, medianViews)]));

  const virals = [...multipliers.values()].filter((m): m is number => m !== null && m >= viralThreshold);
  const avgViralMultiplier = virals.length
    ? Math.round((virals.reduce((sum, m) => sum + m, 0) / virals.length) * 100) / 100
    : null;
  const reelsCount = reels.length;

  return {
    medianViews,
    reelsCount,
    viralCount: virals.length,
    avgViralMultiplier,
    rating: medianViews === null ? null : accountRating({ reelsCount, viralCount: virals.length, avgViralMultiplier }),
    multipliers,
  };
}
