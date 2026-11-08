// Балансы сервисов, за которые платит владелец сайта. Видны только адресам из ADMIN_EMAILS.
import { BALANCE_CACHE_SECONDS, DEEPGRAM_FREE_CREDIT_USD } from "@/config/billing";
import { prisma } from "@/lib/db/prisma";

type FetchLike = typeof fetch;

export type OpenRouterBalance = { remainingUsd: number; usedUsd: number; totalUsd: number };
export type ApifyUsage = { usedUsd: number; limitUsd: number; cycleEndsAt: Date | null };
export type DeepgramUsage = { usedUsd: number; creditUsd: number; remainingUsd: number };
export type ServiceBalances = {
  openrouter: OpenRouterBalance | null;
  apify: ApifyUsage | null;
  deepgram: DeepgramUsage | null;
};

/** Сайт общий для всех клиентов, а ключи сервисов — владельца: балансы видит только он. */
export function isPlatformAdmin(email: string | null | undefined, adminEmails = process.env.ADMIN_EMAILS ?? ""): boolean {
  if (!email) return false;
  const allowed = adminEmails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

async function getJson(fetchImpl: FetchLike, url: string, authorization: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { Authorization: authorization },
    next: { revalidate: BALANCE_CACHE_SECONDS },
  } as RequestInit);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function num(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("Сервис вернул не число");
  return n;
}

export async function fetchOpenRouterBalance(apiKey: string, fetchImpl: FetchLike = fetch): Promise<OpenRouterBalance> {
  const body = (await getJson(fetchImpl, "https://openrouter.ai/api/v1/credits", `Bearer ${apiKey}`)) as {
    data?: { total_credits?: unknown; total_usage?: unknown };
  };
  const totalUsd = num(body.data?.total_credits);
  const usedUsd = num(body.data?.total_usage);
  return { totalUsd, usedUsd, remainingUsd: Math.max(0, totalUsd - usedUsd) };
}

export async function fetchApifyUsage(token: string, fetchImpl: FetchLike = fetch): Promise<ApifyUsage> {
  const body = (await getJson(fetchImpl, "https://api.apify.com/v2/users/me/limits", `Bearer ${token}`)) as {
    data?: { current?: { monthlyUsageUsd?: unknown }; limits?: { maxMonthlyUsageUsd?: unknown }; monthlyUsageCycle?: { endAt?: string } };
  };
  const endAt = body.data?.monthlyUsageCycle?.endAt;
  return {
    usedUsd: num(body.data?.current?.monthlyUsageUsd),
    limitUsd: num(body.data?.limits?.maxMonthlyUsageUsd),
    cycleEndsAt: endAt ? new Date(endAt) : null,
  };
}

export async function deepgramUsage(): Promise<DeepgramUsage> {
  const sum = await prisma.aiUsage.aggregate({ where: { kind: "TRANSCRIPT" }, _sum: { costUsd: true } });
  const usedUsd = sum._sum.costUsd ?? 0;
  return { usedUsd, creditUsd: DEEPGRAM_FREE_CREDIT_USD, remainingUsd: Math.max(0, DEEPGRAM_FREE_CREDIT_USD - usedUsd) };
}

async function safely<T>(label: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error(`Баланс ${label} недоступен:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/** Ошибка одного сервиса не ломает остальные: вместо числа будет «нет данных». */
export async function getServiceBalances(fetchImpl: FetchLike = fetch): Promise<ServiceBalances> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const apifyToken = process.env.APIFY_TOKEN;
  const [openrouter, apify, deepgram] = await Promise.all([
    openRouterKey ? safely("OpenRouter", () => fetchOpenRouterBalance(openRouterKey, fetchImpl)) : null,
    apifyToken ? safely("Apify", () => fetchApifyUsage(apifyToken, fetchImpl)) : null,
    safely("Deepgram", deepgramUsage),
  ]);
  return { openrouter, apify, deepgram };
}

/** Остаток OpenRouter, если он ниже порога; иначе null (в том числе когда сервис недоступен). */
export async function lowAiBalance(threshold: number): Promise<number | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const balance = await safely("OpenRouter", () => fetchOpenRouterBalance(key));
  return balance && balance.remainingUsd < threshold ? balance.remainingUsd : null;
}
