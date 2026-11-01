import { describe, expect, it } from "vitest";
import { accountRating } from "@/config/scoring";
import { accountMedian, computeAccountStats, median, multiplierOf } from "@/lib/research/metrics";
import { parseUsernames } from "@/lib/research/usernames";
import { normalizeReel, normalizeReelsRun, usernameFromUrl } from "@/scraper/normalize";

const NOW = new Date("2026-11-01T08:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("медиана и множитель", () => {
  it("медиана чётного и нечётного списка", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("свежие ролики (моложе 2 дней) не занижают медиану", () => {
    const reels = [
      { id: "a", views: 1000, postedAt: daysAgo(10) },
      { id: "b", views: 2000, postedAt: daysAgo(9) },
      { id: "c", views: 3000, postedAt: daysAgo(8) },
      { id: "fresh", views: 10, postedAt: daysAgo(0.5) },
    ];
    expect(accountMedian(reels, NOW)).toBe(2000);
  });

  it("медиана не считается, если роликов меньше трёх", () => {
    expect(accountMedian([{ id: "a", views: 100, postedAt: daysAgo(5) }], NOW)).toBeNull();
  });

  it("множитель = просмотры / медиана", () => {
    expect(multiplierOf(9000, 3000)).toBe(3);
    expect(multiplierOf(100, null)).toBeNull();
    expect(multiplierOf(100, 0)).toBeNull();
  });

  it("залёты считаются по порогу", () => {
    const reels = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, views: 1000, postedAt: daysAgo(5 + i) }));
    reels.push({ id: "viral", views: 5000, postedAt: daysAgo(4) }, { id: "mega", views: 20000, postedAt: daysAgo(1) });
    const stats = computeAccountStats(reels, NOW, 3);
    expect(stats.medianViews).toBe(1000);
    expect(stats.viralCount).toBe(2);
    expect(stats.avgViralMultiplier).toBe(12.5);
    expect(stats.multipliers.get("mega")).toBe(20);
  });
});

describe("рейтинг аккаунта", () => {
  it("не считается при малой статистике", () => {
    expect(accountRating({ reelsCount: 5, viralCount: 1, avgViralMultiplier: 4 })).toBeNull();
  });
  it("доля залётов × средний множитель × 10", () => {
    expect(accountRating({ reelsCount: 30, viralCount: 3, avgViralMultiplier: 5 })).toBe(5);
    expect(accountRating({ reelsCount: 30, viralCount: 0, avgViralMultiplier: null })).toBe(0);
  });
});

describe("список аккаунтов", () => {
  it("понимает ники, @ники и ссылки, убирает дубли", () => {
    const { valid, invalid } = parseUsernames(
      "hormozi\n@Al_Shanin, https://www.instagram.com/k.gadzhiev_/?hl=ru\nhormozi  не-ник!",
    );
    expect(valid).toEqual(["hormozi", "al_shanin", "k.gadzhiev_"]);
    expect(invalid).toEqual(["не-ник!"]);
  });
  it("не принимает ссылки на посты вместо профиля", () => {
    expect(parseUsernames("https://www.instagram.com/reel/DfKTYs8OMed/").valid).toEqual([]);
  });
});

describe("ответы Apify", () => {
  const item = {
    shortCode: "DezY81Gt_pg",
    ownerUsername: "K.Gadzhiev_",
    ownerFullName: "Кирилл",
    url: "https://www.instagram.com/p/DezY81Gt_pg/",
    timestamp: "2026-10-22T10:00:00.000Z",
    videoViewCount: null,
    videoPlayCount: 11535,
    likesCount: 400,
    commentsCount: 12,
    videoDuration: 31.5,
    hashtags: ["reels", 5],
    musicInfo: { uses_original_audio: false, song_name: "Song", artist_name: "Artist" },
    isPinned: false,
  };

  it("берёт просмотры из videoPlayCount (как в Instagram)", () => {
    const reel = normalizeReel(item);
    expect(reel?.views).toBe(11535);
    expect(reel?.username).toBe("k.gadzhiev_");
    expect(reel?.hashtags).toEqual(["reels"]);
    expect(reel?.musicTitle).toBe("Song");
  });

  it("ошибки аккаунтов попадают в список сбоев, а не в ролики", () => {
    const result = normalizeReelsRun([item, { inputUrl: "https://www.instagram.com/al_shanin", error: "Restricted profile" }]);
    expect(result.reels).toHaveLength(1);
    expect(result.failures).toEqual([{ username: "al_shanin", reason: "Restricted profile" }]);
  });

  it("ник из ссылки на профиль", () => {
    expect(usernameFromUrl("https://www.instagram.com/hormozi/")).toBe("hormozi");
    expect(usernameFromUrl("https://www.instagram.com/p/abc/")).toBeNull();
  });
});
