// Запросы к Instagram API. fetch передаётся снаружи — в тестах подставляется поддельный.
import { INSTAGRAM_API, INSTAGRAM_METRICS, INSTAGRAM_SCOPES } from "@/config/instagram";

type FetchLike = typeof fetch;

export type IgToken = { accessToken: string; expiresAt: Date };
export type IgProfile = { igUserId: string; username: string };
export type IgMedia = {
  id: string;
  caption: string | null;
  mediaType: string;
  productType: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  timestamp: Date;
  likeCount: number | null;
  commentsCount: number | null;
};
export type IgComment = { id: string; username: string; text: string; timestamp: Date };
export type IgInsights = Partial<Record<"views" | "reach" | "likes" | "comments" | "saved" | "shares" | "ig_reels_avg_watch_time", number>>;

export interface InstagramClient {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<IgToken>;
  refresh(accessToken: string): Promise<IgToken>;
  profile(accessToken: string): Promise<IgProfile>;
  listMedia(accessToken: string, limit: number): Promise<IgMedia[]>;
  insights(accessToken: string, media: IgMedia): Promise<IgInsights>;
  listComments(accessToken: string, mediaId: string): Promise<IgComment[]>;
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

function credentials() {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) throw new Error("INSTAGRAM_APP_ID и INSTAGRAM_APP_SECRET не заданы");
  return { appId, appSecret };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = body.error as { message?: string } | undefined;
    // Сообщение Instagram без токенов и секретов: они в адресе запроса, а не в ответе
    throw new InstagramApiError(error?.message ?? (body.error_message as string | undefined) ?? `HTTP ${response.status}`, response.status);
  }
  return body;
}

const graph = (path: string, params: Record<string, string>) =>
  `${INSTAGRAM_API.graphUrl}/${INSTAGRAM_API.version}/${path}?${new URLSearchParams(params).toString()}`;

function toToken(body: Record<string, unknown>, now: Date): IgToken {
  const accessToken = body.access_token;
  const expiresIn = Number(body.expires_in);
  if (typeof accessToken !== "string" || !Number.isFinite(expiresIn)) throw new InstagramApiError("Instagram не вернул доступ", 502);
  return { accessToken, expiresAt: new Date(now.getTime() + expiresIn * 1000) };
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function createInstagramClient(fetchImpl: FetchLike = fetch, clock: () => Date = () => new Date()): InstagramClient {
  return {
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({
        client_id: credentials().appId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: INSTAGRAM_SCOPES.join(","),
        state,
      });
      return `${INSTAGRAM_API.authorizeUrl}?${params.toString()}`;
    },

    /** Код из адреса → короткий доступ → долгий (60 дней). */
    async exchangeCode(code, redirectUri) {
      const { appId, appSecret } = credentials();
      const short = await readJson(
        await fetchImpl(INSTAGRAM_API.tokenUrl, {
          method: "POST",
          body: new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
        }),
      );
      const shortBody = (Array.isArray(short.data) ? short.data[0] : short) as Record<string, unknown>;
      const shortToken = shortBody?.access_token;
      if (typeof shortToken !== "string") throw new InstagramApiError("Instagram не вернул доступ", 502);
      const long = await readJson(
        await fetchImpl(`${INSTAGRAM_API.graphUrl}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret, access_token: shortToken })}`),
      );
      return toToken(long, clock());
    },

    async refresh(accessToken) {
      const body = await readJson(
        await fetchImpl(`${INSTAGRAM_API.graphUrl}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: accessToken })}`),
      );
      return toToken(body, clock());
    },

    async profile(accessToken) {
      const body = await readJson(await fetchImpl(graph("me", { fields: "user_id,username", access_token: accessToken })));
      if (typeof body.username !== "string") throw new InstagramApiError("Instagram не вернул профиль", 502);
      return { igUserId: String(body.user_id ?? body.id), username: body.username };
    },

    async listMedia(accessToken, limit) {
      const body = await readJson(
        await fetchImpl(
          graph("me/media", {
            fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
            limit: String(limit),
            access_token: accessToken,
          }),
        ),
      );
      const items = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
      return items.map((m) => ({
        id: String(m.id),
        caption: typeof m.caption === "string" ? m.caption : null,
        mediaType: String(m.media_type ?? ""),
        productType: typeof m.media_product_type === "string" ? m.media_product_type : null,
        permalink: typeof m.permalink === "string" ? m.permalink : null,
        thumbnailUrl: typeof m.thumbnail_url === "string" ? m.thumbnail_url : typeof m.media_url === "string" && m.media_type === "IMAGE" ? m.media_url : null,
        timestamp: new Date(String(m.timestamp)),
        likeCount: num(m.like_count),
        commentsCount: num(m.comments_count),
      }));
    },

    /** Последние комментарии под публикацией (для кодовых слов). */
    async listComments(accessToken, mediaId) {
      const body = await readJson(await fetchImpl(graph(`${mediaId}/comments`, { fields: "id,text,username,timestamp", limit: "100", access_token: accessToken })));
      const items = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
      return items
        .filter((c) => typeof c.username === "string" && typeof c.text === "string")
        .map((c) => ({ id: String(c.id), username: c.username as string, text: c.text as string, timestamp: new Date(String(c.timestamp)) }));
    },

    /** Пустой ответ по метрике — «нет данных», а не ноль. У альбомов статистики нет. */
    async insights(accessToken, media) {
      if (media.mediaType === "CAROUSEL_ALBUM") return {};
      const metrics = media.productType === "REELS" ? INSTAGRAM_METRICS.reels : INSTAGRAM_METRICS.feed;
      const body = await readJson(await fetchImpl(graph(`${media.id}/insights`, { metric: metrics.join(","), access_token: accessToken })));
      const result: IgInsights = {};
      for (const item of Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : []) {
        const values = item.values as { value?: unknown }[] | undefined;
        const value = num(values?.[0]?.value) ?? num((item.total_value as { value?: unknown } | undefined)?.value);
        if (value !== null) result[item.name as keyof IgInsights] = value;
      }
      return result;
    },
  };
}

export const instagramClient = createInstagramClient();
