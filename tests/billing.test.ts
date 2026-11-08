import { describe, expect, it } from "vitest";
import { fetchApifyUsage, fetchOpenRouterBalance, isPlatformAdmin } from "@/lib/billing/balances";

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; auth: string }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: (init?.headers as Record<string, string>).Authorization });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("балансы сервисов", () => {
  it("OpenRouter: остаток = пополнено − потрачено", async () => {
    const { impl, calls } = fakeFetch(200, { data: { total_credits: 5, total_usage: 0.53 } });
    const balance = await fetchOpenRouterBalance("sk-test", impl);
    expect(balance.remainingUsd).toBeCloseTo(4.47);
    expect(calls[0]).toEqual({ url: "https://openrouter.ai/api/v1/credits", auth: "Bearer sk-test" });
  });

  it("Apify: расход за месяц и лимит", async () => {
    const { impl } = fakeFetch(200, {
      data: {
        monthlyUsageCycle: { endAt: "2026-11-29T23:59:59.999Z" },
        limits: { maxMonthlyUsageUsd: 5 },
        current: { monthlyUsageUsd: 1.79 },
      },
    });
    expect(await fetchApifyUsage("apify-test", impl)).toEqual({
      usedUsd: 1.79,
      limitUsd: 5,
      cycleEndsAt: new Date("2026-11-29T23:59:59.999Z"),
    });
  });

  it("ошибка сервиса и странный ответ — исключение, а не ноль", async () => {
    await expect(fetchOpenRouterBalance("k", fakeFetch(401, {}).impl)).rejects.toThrow("HTTP 401");
    await expect(fetchOpenRouterBalance("k", fakeFetch(200, { data: {} }).impl)).rejects.toThrow();
  });

  it("балансы видит только владелец сайта", () => {
    expect(isPlatformAdmin("Owner@Mail.com", "owner@mail.com, other@mail.com")).toBe(true);
    expect(isPlatformAdmin("client@mail.com", "owner@mail.com")).toBe(false);
    expect(isPlatformAdmin("owner@mail.com", "")).toBe(false);
    expect(isPlatformAdmin(null, "owner@mail.com")).toBe(false);
  });
});
