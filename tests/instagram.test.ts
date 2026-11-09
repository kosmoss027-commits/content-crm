import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getProjectContext } from "@/lib/db/access";
import { AppError } from "@/lib/db/errors";
import { createPublication } from "@/lib/db/publications";
import { decryptToken, encryptToken } from "@/lib/instagram/crypto";
import { createInstagramClient, InstagramApiError, type IgMedia, type InstagramClient } from "@/lib/instagram/client";
import { disconnectInstagram, getConnection, saveConnection, syncInstagram } from "@/lib/instagram/sync";
import { createUser, createWorkspace, resetDatabase } from "./helpers";

const expectCode = (code: AppError["code"]) => expect.objectContaining({ name: "AppError", code });
const NOW = new Date("2026-11-09T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

beforeAll(() => {
  process.env.INSTAGRAM_TOKEN_KEY = randomBytes(32).toString("base64");
  process.env.INSTAGRAM_APP_ID = "app-id";
  process.env.INSTAGRAM_APP_SECRET = "app-secret";
});

function media(id: string, timestamp: string, extra: Partial<IgMedia> = {}): IgMedia {
  return {
    id,
    caption: `Ролик ${id}\nвторая строка`,
    mediaType: "VIDEO",
    productType: "REELS",
    permalink: `https://www.instagram.com/reel/${id}/`,
    thumbnailUrl: null,
    timestamp: new Date(timestamp),
    likeCount: 10,
    commentsCount: 2,
    ...extra,
  };
}

/** Поддельный клиент: заданные публикации и статистика, запоминает продления. */
function fakeClient(items: IgMedia[], insights: Record<string, Record<string, number>> = {}, fail?: Error) {
  const calls = { refreshed: 0 };
  const client: InstagramClient = {
    authorizeUrl: () => "",
    exchangeCode: async () => ({ accessToken: "token", expiresAt: new Date(NOW.getTime() + 60 * DAY) }),
    async refresh() {
      calls.refreshed += 1;
      return { accessToken: "fresh-token", expiresAt: new Date(NOW.getTime() + 60 * DAY) };
    },
    profile: async () => ({ igUserId: "1", username: "amin" }),
    async listMedia() {
      if (fail) throw fail;
      return items;
    },
    async insights(_token, m) {
      if (m.id === "broken") throw new InstagramApiError("Media posted before business conversion", 400);
      return insights[m.id] ?? {};
    },
  };
  return { client, calls };
}

async function setup() {
  const alice = await createUser("alice@test.ru");
  const smm = await createUser("smm@test.ru");
  const bob = await createUser("bob@test.ru");
  const wsA = await createWorkspace(alice, ["Блог"], [{ userId: smm.id, role: "SMM" }]);
  const wsB = await createWorkspace(bob, ["Чужой"]);
  const ctxA = await getProjectContext(alice.id, wsA.projects[0].id);
  const smmCtx = await getProjectContext(smm.id, wsA.projects[0].id);
  const ctxB = await getProjectContext(bob.id, wsB.projects[0].id);
  return { ctxA, smmCtx, ctxB };
}

describe("Instagram: шифрование и ответы API", () => {
  it("доступ хранится зашифрованным и расшифровывается только тем же ключом", () => {
    const sealed = encryptToken("IGAA-secret-token");
    expect(sealed).not.toContain("IGAA");
    expect(decryptToken(sealed)).toBe("IGAA-secret-token");
    expect(() => decryptToken(sealed, randomBytes(32).toString("base64"))).toThrow();
  });

  it("код меняется на долгий доступ, статистика разбирается, пустые метрики не становятся нулём", async () => {
    const requests: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
      if (url.startsWith("https://api.instagram.com/oauth/access_token")) {
        return Response.json({ data: [{ access_token: "short", user_id: "1", permissions: "instagram_business_basic" }] });
      }
      if (url.includes("/access_token?")) return Response.json({ access_token: "long", token_type: "bearer", expires_in: 5183944 });
      if (url.includes("/insights?")) {
        return Response.json({
          data: [
            { name: "views", values: [{ value: 1500 }] },
            { name: "reach", values: [{ value: 1100 }] },
            { name: "ig_reels_avg_watch_time", values: [{ value: 6400 }] },
            { name: "shares", values: [] },
          ],
        });
      }
      return Response.json({ error: { message: "Invalid OAuth access token" } }, { status: 400 });
    }) as unknown as typeof fetch;
    const client = createInstagramClient(fetchImpl, () => NOW);

    const token = await client.exchangeCode("code", "https://site/api/instagram/callback");
    expect(token).toEqual({ accessToken: "long", expiresAt: new Date(NOW.getTime() + 5183944 * 1000) });
    expect(requests).toEqual(["POST https://api.instagram.com/oauth/access_token", "GET https://graph.instagram.com/access_token"]);

    expect(await client.insights("long", media("m1", "2026-11-05T10:00:00Z"))).toEqual({ views: 1500, reach: 1100, ig_reels_avg_watch_time: 6400 });
    expect(await client.insights("long", media("album", "2026-11-05T10:00:00Z", { mediaType: "CAROUSEL_ALBUM" }))).toEqual({});
    await expect(client.profile("bad")).rejects.toMatchObject({ name: "InstagramApiError", status: 400, message: "Invalid OAuth access token" });
  });
});

describe("Instagram: подключение и обновление", () => {
  beforeEach(resetDatabase);

  it("подключает только владелец, отключение — тоже", async () => {
    const { ctxA, smmCtx } = await setup();
    const token = { accessToken: "t", expiresAt: new Date(NOW.getTime() + 60 * DAY) };
    await expect(saveConnection(smmCtx, token, { igUserId: "1", username: "amin" })).rejects.toEqual(expectCode("FORBIDDEN"));
    await saveConnection(ctxA, token, { igUserId: "1", username: "amin" });
    expect(await getConnection(ctxA)).toMatchObject({ username: "amin", lastSyncAt: null });
    await expect(disconnectInstagram(smmCtx)).rejects.toEqual(expectCode("FORBIDDEN"));
  });

  it("новые публикации создаются, запланированная карточка связывается, статистика не затирается пустым ответом", async () => {
    const { ctxA, ctxB } = await setup();
    await saveConnection(ctxA, { accessToken: "t", expiresAt: new Date(NOW.getTime() + 50 * DAY) }, { igUserId: "1", username: "amin" });
    const planned = await createPublication(ctxA, { title: "Мой план", platform: "INSTAGRAM", type: "CASE", status: "EDIT", date: "2026-11-05" });
    const foreign = await createPublication(ctxB, { title: "Чужой план", platform: "INSTAGRAM", type: "CASE", status: "EDIT", date: "2026-11-06" });

    const items = [media("m1", "2026-11-05T15:00:00Z"), media("m2", "2026-11-06T04:00:00Z"), media("broken", "2026-11-07T04:00:00Z")];
    const { client } = fakeClient(items, { m1: { views: 1500, reach: 1100, ig_reels_avg_watch_time: 6400 } });
    expect(await syncInstagram(ctxA.projectId, client, NOW)).toEqual({ media: 3, created: 2, linked: 1, updated: 0, insightErrors: 1 });

    const linked = await prisma.publication.findUniqueOrThrow({ where: { id: planned.id } });
    expect(linked).toMatchObject({ igMediaId: "m1", status: "PUBLISHED", title: "Мой план", views: 1500, avgWatchSec: 6.4, likes: 10 });
    const created = await prisma.publication.findFirstOrThrow({ where: { igMediaId: "m2" } });
    expect(created).toMatchObject({ projectId: ctxA.projectId, title: "Ролик m2", status: "PUBLISHED", date: new Date("2026-11-06T00:00:00Z") });
    expect(await prisma.publication.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({ igMediaId: null, status: "EDIT" });

    // Второй раз Instagram не отдал статистику (задержка) — цифры остаются прежними
    const again = fakeClient(items, {});
    expect(await syncInstagram(ctxA.projectId, again.client, NOW)).toMatchObject({ updated: 3, created: 0 });
    expect(await prisma.publication.findUniqueOrThrow({ where: { id: planned.id } })).toMatchObject({ views: 1500, reach: 1100 });
    expect(await getConnection(ctxA)).toMatchObject({ lastSyncAt: NOW, lastError: null });
  });

  it("доступ продлевается заранее, ошибка доступа записывается и видна в Настройках", async () => {
    const { ctxA } = await setup();
    await saveConnection(ctxA, { accessToken: "old", expiresAt: new Date(NOW.getTime() + 5 * DAY) }, { igUserId: "1", username: "amin" });
    const { client, calls } = fakeClient([]);
    await syncInstagram(ctxA.projectId, client, NOW);
    expect(calls.refreshed).toBe(1);
    const row = await prisma.instagramConnection.findUniqueOrThrow({ where: { projectId: ctxA.projectId } });
    expect(decryptToken(row.accessTokenEnc)).toBe("fresh-token");

    const failing = fakeClient([], {}, new InstagramApiError("Session has expired", 401));
    expect(await syncInstagram(ctxA.projectId, failing.client, NOW)).toEqual({ error: expect.stringContaining("подключите заново") });
    expect((await getConnection(ctxA))?.lastError).toContain("подключите заново");
  });
});
