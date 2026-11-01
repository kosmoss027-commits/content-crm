// Провайдер сбора через Apify (https://apify.com). Логинов Instagram не использует.
import { normalizeProfilesRun, normalizeReelsRun } from "./normalize";
import type { ProfilesRequest, ReelsRequest, RunKind, RunResult, RunState, ScraperProvider } from "./types";

const API = "https://api.apify.com/v2";
const ACTORS = {
  reels: "apify~instagram-reel-scraper",
  profiles: "apify~instagram-profile-scraper",
};

function token(): string {
  const value = process.env.APIFY_TOKEN;
  if (!value) throw new Error("APIFY_TOKEN не задан: сбор роликов недоступен.");
  return value;
}

async function apify<T>(path: string, init?: RequestInit): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${API}${path}${separator}token=${encodeURIComponent(token())}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Apify ответил ${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

/** Webhook: Apify сам сообщит приложению, когда сбор закончится. */
function webhooksParam(webhookUrl?: string): string {
  if (!webhookUrl) return "";
  const hooks = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
      requestUrl: webhookUrl,
    },
  ];
  return `&webhooks=${encodeURIComponent(Buffer.from(JSON.stringify(hooks)).toString("base64"))}`;
}

async function startActor(actor: string, input: unknown, maxCostUsd: number, webhookUrl?: string): Promise<string> {
  const query = `?maxTotalChargeUsd=${maxCostUsd.toFixed(2)}${webhooksParam(webhookUrl)}`;
  const { data } = await apify<{ data: { id: string } }>(`/acts/${actor}/runs${query}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.id;
}

type ApifyRun = { status: string; usageTotalUsd?: number; defaultDatasetId: string; statusMessage?: string };

export const apifyProvider: ScraperProvider = {
  startReels(request: ReelsRequest) {
    const input = {
      username: request.usernames,
      resultsLimit: request.limitPerAccount ?? 50,
      skipPinnedPosts: true,
      skipTrialReels: true,
      ...(request.newerThan ? { onlyPostsNewerThan: request.newerThan.toISOString().slice(0, 10) } : {}),
    };
    return startActor(ACTORS.reels, input, request.maxCostUsd, request.webhookUrl);
  },

  startProfiles(request: ProfilesRequest) {
    return startActor(ACTORS.profiles, { usernames: request.usernames }, request.maxCostUsd, request.webhookUrl);
  },

  async getRunState(runId: string): Promise<RunState> {
    const { data } = await apify<{ data: ApifyRun }>(`/actor-runs/${runId}`);
    const finished = ["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"].includes(data.status);
    return {
      status: !finished ? "running" : data.status === "SUCCEEDED" ? "succeeded" : "failed",
      costUsd: data.usageTotalUsd ?? 0,
      error: finished && data.status !== "SUCCEEDED" ? (data.statusMessage ?? data.status) : null,
    };
  },

  async getRunResult(runId: string, kind: RunKind): Promise<RunResult> {
    const { data } = await apify<{ data: ApifyRun }>(`/actor-runs/${runId}`);
    const items = await apify<Record<string, unknown>[]>(`/datasets/${data.defaultDatasetId}/items?clean=true`);
    return kind === "reels" ? normalizeReelsRun(items) : normalizeProfilesRun(items);
  },
};
