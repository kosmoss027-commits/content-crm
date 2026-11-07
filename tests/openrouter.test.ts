// Подключение Claude через OpenRouter с поддельным fetch.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analysisSchema, relevanceSchema } from "@/lib/ai/prompts";
import { createOpenRouterClient, openRouterModel, strictJsonSchema } from "@/lib/ai/openrouter";
import { claudeCostUsd } from "@/lib/ai/usage";

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

const request = {
  kind: "RELEVANCE" as const,
  model: "claude-sonnet-5-5",
  system: "система",
  content: [
    { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: "QUJD" } },
    { type: "text" as const, text: "ролик" },
  ],
  schema: relevanceSchema,
  effort: "low" as const,
  maxTokens: 1024,
};

describe("OpenRouter", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it("имя модели в формате OpenRouter", () => {
    expect(openRouterModel("claude-sonnet-5-5")).toBe("anthropic/claude-sonnet-5.5");
  });

  it("схема для strict-режима: без доп. полей и без числовых ограничений", () => {
    const schema = strictJsonSchema(relevanceSchema) as { additionalProperties: boolean; properties: { score: Record<string, unknown> } };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.score).not.toHaveProperty("minimum");
    expect(JSON.stringify(strictJsonSchema(analysisSchema))).not.toContain('"additionalProperties":true');
  });

  it("отправляет картинки и схему, проверяет ответ и берёт стоимость от OpenRouter", async () => {
    const { impl, calls } = fakeFetch(200, {
      choices: [{ message: { content: JSON.stringify({ score: 7, reason: "в тему" }) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 900, completion_tokens: 40, cost: 0.0123 },
    });
    const result = await createOpenRouterClient(impl).generate(request);

    expect(result.data).toEqual({ score: 7, reason: "в тему" });
    expect(claudeCostUsd("claude-sonnet-5-5", result.usage)).toBe(0.0123);
    const sent = calls[0].body as { model: string; messages: { content: unknown }[]; response_format: { type: string } };
    expect(sent.model).toBe("anthropic/claude-sonnet-5.5");
    expect(sent.response_format.type).toBe("json_schema");
    expect(JSON.stringify(sent.messages[1].content)).toContain("data:image/jpeg;base64,QUJD");
  });

  it("ответ не по схеме — понятная ошибка", async () => {
    const { impl } = fakeFetch(200, { choices: [{ message: { content: JSON.stringify({ score: 42 }) }, finish_reason: "stop" }] });
    await expect(createOpenRouterClient(impl).generate(request)).rejects.toThrow("не по схеме");
  });

  it("ошибка OpenRouter (например, нет денег на балансе) — с текстом причины", async () => {
    const { impl } = fakeFetch(402, { error: { message: "Insufficient credits" } });
    await expect(createOpenRouterClient(impl).generate(request)).rejects.toThrow("402: Insufficient credits");
  });
});
