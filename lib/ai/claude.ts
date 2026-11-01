// Вызов Claude со структурированным ответом (JSON по схеме Zod).
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { LlmClient, LlmRequest, LlmResult } from "@/lib/ai/types";

/** Модели, у которых есть резервная модель на случай отказа (server-side fallback). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY не задан: разбор через Claude недоступен.");
  client ??= new Anthropic();
  return client;
}

export const claudeClient: LlmClient = {
  async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    const withFallback = FALLBACK_MODELS.has(request.model);
    const response = await anthropic().beta.messages.parse({
      model: request.model,
      max_tokens: request.maxTokens,
      // Системный промпт стабилен для всех роликов проекта — кэшируется.
      system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: request.content }],
      output_config: { effort: request.effort, format: betaZodOutputFormat(request.schema) },
      ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    if (response.stop_reason === "refusal") throw new Error("Claude отказался разбирать этот материал.");
    if (response.stop_reason === "max_tokens") throw new Error("Ответ Claude обрезан по лимиту длины.");
    if (!response.parsed_output) throw new Error("Claude вернул ответ не по схеме.");

    const usage = response.usage;
    return {
      data: response.parsed_output as T,
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      },
    };
  },
};
