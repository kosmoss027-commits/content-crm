// Подключение Instagram к проекту и обновление публикаций со статистикой.
import { INSTAGRAM_SYNC } from "@/config/instagram";
import { prisma } from "@/lib/db/prisma";
import { assertCan, type ProjectContext } from "@/lib/db/access";
import { dayToDate, shortDay, todayDay } from "@/lib/content/dates";
import { decryptToken, encryptToken } from "@/lib/instagram/crypto";
import { InstagramApiError, type IgInsights, type IgMedia, type IgProfile, type IgToken, type InstagramClient } from "@/lib/instagram/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Подключать и отключать Instagram может только владелец. */
export async function saveConnection(ctx: ProjectContext, token: IgToken, profile: IgProfile) {
  assertCan(ctx, "project.manage");
  const data = { igUserId: profile.igUserId, username: profile.username, accessTokenEnc: encryptToken(token.accessToken), expiresAt: token.expiresAt, lastError: null };
  await prisma.instagramConnection.upsert({
    where: { projectId: ctx.projectId },
    update: data,
    create: { ...data, workspaceId: ctx.workspaceId, projectId: ctx.projectId },
  });
}

export async function disconnectInstagram(ctx: ProjectContext) {
  assertCan(ctx, "project.manage");
  await prisma.instagramConnection.deleteMany({ where: { projectId: ctx.projectId } });
}

export async function getConnection(ctx: ProjectContext) {
  return prisma.instagramConnection.findUnique({
    where: { projectId: ctx.projectId },
    select: { username: true, expiresAt: true, lastSyncAt: true, lastError: true },
  });
}

function titleFrom(media: IgMedia, day: string): string {
  const firstLine = media.caption?.split("\n").find((line) => line.trim())?.trim() ?? "";
  if (!firstLine) return `Публикация Instagram ${shortDay(day)}`;
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

/** Только известные значения: пустой ответ Instagram не затирает уже сохранённые цифры. */
function statsFrom(media: IgMedia, insights: IgInsights, now: Date) {
  const values = {
    views: insights.views,
    reach: insights.reach,
    likes: insights.likes ?? media.likeCount ?? undefined,
    comments: insights.comments ?? media.commentsCount ?? undefined,
    saves: insights.saved,
    shares: insights.shares,
    // Instagram отдаёт средний досмотр в миллисекундах
    avgWatchSec: insights.ig_reels_avg_watch_time === undefined ? undefined : insights.ig_reels_avg_watch_time / 1000,
  };
  return { ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== null)), statsUpdatedAt: now };
}

async function upsertMedia(connection: { projectId: string; workspaceId: string }, media: IgMedia, insights: IgInsights, now: Date): Promise<"created" | "linked" | "updated"> {
  const day = todayDay(media.timestamp);
  const igFields = { igMediaId: media.id, permalink: media.permalink, mediaType: media.productType ?? media.mediaType, thumbnailUrl: media.thumbnailUrl, publishedAt: media.timestamp };
  const stats = statsFrom(media, insights, now);

  const existing = await prisma.publication.findUnique({ where: { projectId_igMediaId: { projectId: connection.projectId, igMediaId: media.id } }, select: { id: true } });
  if (existing) {
    await prisma.publication.update({ where: { id: existing.id }, data: { ...igFields, ...stats } });
    return "updated";
  }
  // Карточка, запланированная на этот день в Instagram, сама связывается с вышедшей публикацией.
  // Идеи не трогаем; из остальных берём самую готовую (Опубликовано → Готово → Монтаж → …).
  const planned = await prisma.publication.findFirst({
    where: { projectId: connection.projectId, igMediaId: null, platform: "INSTAGRAM", date: dayToDate(day), status: { not: "IDEA" } },
    orderBy: [{ status: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (planned) {
    await prisma.publication.update({ where: { id: planned.id }, data: { ...igFields, ...stats, status: "PUBLISHED" } });
    return "linked";
  }
  await prisma.publication.create({
    data: {
      ...igFields,
      ...stats,
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      platform: "INSTAGRAM",
      status: "PUBLISHED",
      date: dayToDate(day),
      title: titleFrom(media, day),
      text: media.caption ?? "",
    },
  });
  return "created";
}

export type SyncReport = { media: number; created: number; linked: number; updated: number; insightErrors: number };

/** Обновить публикации проекта из Instagram. Ошибку доступа записывает в подключение, а не бросает дальше. */
export async function syncInstagram(projectId: string, client: InstagramClient, now = new Date()): Promise<SyncReport | { error: string }> {
  const connection = await prisma.instagramConnection.findUnique({ where: { projectId } });
  if (!connection) return { error: "Instagram не подключён" };
  try {
    let accessToken = decryptToken(connection.accessTokenEnc);
    if (connection.expiresAt.getTime() - now.getTime() < INSTAGRAM_SYNC.refreshWhenDaysLeft * DAY_MS) {
      const fresh = await client.refresh(accessToken);
      accessToken = fresh.accessToken;
      await prisma.instagramConnection.update({ where: { id: connection.id }, data: { accessTokenEnc: encryptToken(fresh.accessToken), expiresAt: fresh.expiresAt } });
    }

    const media = await client.listMedia(accessToken, INSTAGRAM_SYNC.mediaLimit);
    const report: SyncReport = { media: media.length, created: 0, linked: 0, updated: 0, insightErrors: 0 };
    for (const item of media) {
      if (Number.isNaN(item.timestamp.getTime())) continue; // без даты публикацию не разместить в плане
      let insights: IgInsights = {};
      try {
        insights = await client.insights(accessToken, item);
      } catch (error) {
        // Статистика одной публикации не должна ломать остальные (например, слишком свежая)
        report.insightErrors += 1;
        console.error(`Instagram: нет статистики для ${item.id}:`, error instanceof Error ? error.message : error);
      }
      try {
        report[await upsertMedia(connection, item, insights, now)] += 1;
      } catch (error) {
        // Например, параллельное обновление (ручное + cron) уже создало эту публикацию — остальные не страдают
        console.error(`Instagram: не удалось сохранить ${item.id}:`, error instanceof Error ? error.message : error);
      }
    }
    await prisma.instagramConnection.update({ where: { id: connection.id }, data: { lastSyncAt: now, lastError: null } });
    return report;
  } catch (error) {
    const message =
      error instanceof InstagramApiError && (error.status === 400 || error.status === 401)
        ? "Доступ к Instagram истёк или отозван — подключите заново в Настройках."
        : "Не удалось обновить данные из Instagram. Попробуйте позже.";
    console.error("Instagram: ошибка обновления", error instanceof Error ? error.message : error);
    // lastSyncAt ставим и при ошибке: иначе cron повторял бы запрос каждый час, а не раз в сутки
    await prisma.instagramConnection.update({ where: { id: connection.id }, data: { lastError: message, lastSyncAt: now } });
    return { error: message };
  }
}

/** Для cron: проекты, которые давно не обновлялись. */
export async function syncDueInstagram(client: InstagramClient, now = new Date()): Promise<number> {
  const due = await prisma.instagramConnection.findMany({
    where: { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(now.getTime() - INSTAGRAM_SYNC.everyHours * HOUR_MS) } }] },
    select: { projectId: true },
  });
  for (const { projectId } of due) {
    try {
      await syncInstagram(projectId, client, now);
    } catch (error) {
      console.error(`Instagram: обновление проекта ${projectId} прервано:`, error instanceof Error ? error.message : error);
    }
  }
  return due.length;
}
