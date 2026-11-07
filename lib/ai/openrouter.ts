// Claude через OpenRouter (https://openrouter.ai): тот же Claude, без проверки личности у Anthropic.
// Ответ строго по JSON-схеме (structured outputs), стоимость OpenRouter возвращает сам.
import { z } from "zod";
import type { LlmClient, LlmRequest, LlmResult } from "@/lib/ai/types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/** Ограничения, которые strict-режим может не поддерживать: проверяем их сами через Zod после ответа. */
const UNSUPPORTED_KEYWORDS = new Set(["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "pattern", "format", "minItems", "maxItems"]);

/** claude-sonnet-5-5 → anthropic/claude-sonnet-5.5 */
export function openRouterModel(model: string): string {
  return `anthropic/${model.replace(/-(\d+)-(\d+)$/, "-$1.$2")}`;
}

/** JSON-схема из Zod, пригодная для strict-режима: без лишних ограничений, без дополнительных полей. */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== "object") return node;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (!UNSUPPORTED_KEYWORDS.has(key)) result[key] = clean(value);
    }
    if (result.type === "object") result.additionalProperties = false;
    return result;
  };
  return clean(z.toJSONSchema(schema)) as Record<string, unknown>;
}

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

function toOpenRouterContent(content: LlmRequest<unknown>["content"]): ContentPart[] {
  return content.flatMap((block): ContentPart[] => {
    if (block.type === "text") return [{ type: "text", text: block.text }];
    if (block.type === "image" && block.source.type === "base64") {
      return [{ type: "image_url", image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } }];
    }
    return [];
  });
}

type OpenRouterResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  };
  error?: { message?: string };
};

export function createOpenRouterClient(fetchImpl: typeof fetch = fetch): LlmClient {
  return {
    async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("OPENROUTER_API_KEY не задан: разбор через Claude недоступен.");

      const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "Content CRM",
        },
        body: JSON.stringify({
          model: openRouterModel(request.model),
          max_tokens: request.maxTokens,
          reasoning: { effort: request.effort },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: toOpenRouterContent(request.content) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: request.kind.toLowerCase(), strict: true, schema: strictJsonSchema(request.schema) },
          },
          provider: { require_parameters: true },
        }),
      });

      const json = (await response.json().catch(() => ({}))) as OpenRouterResponse;
      if (!response.ok) throw new Error(`OpenRouter ответил ${response.status}: ${json.error?.message ?? "без описания"}`);

      const choice = json.choices?.[0];
      if (choice?.finish_reason === "length") throw new Error("Ответ Claude обрезан по лимиту длины.");
      if (choice?.finish_reason === "content_filter") throw new Error("Claude отказался разбирать этот материал.");
      const text = choice?.message?.content;
      if (!text) throw new Error("OpenRouter вернул пустой ответ.");

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Claude вернул ответ не в формате JSON.");
      }
      const data = request.schema.safeParse(parsed);
      if (!data.success) throw new Error(`Claude вернул ответ не по схеме: ${data.error.issues[0]?.message ?? ""}`);

      const usage = json.usage ?? {};
      return {
        data: data.data,
        usage: {
          inputTokens: usage.prompt_tokens ?? 0,
          outputTokens: usage.completion_tokens ?? 0,
          cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
          cacheWriteTokens: usage.prompt_tokens_details?.cache_write_tokens ?? 0,
          // OpenRouter списывает в кредитах, 1 кредит = $1
          costUsd: typeof usage.cost === "number" ? usage.cost : undefined,
        },
      };
    },
  };
}

export const openRouterClient = createOpenRouterClient();
