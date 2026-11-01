// Внешние сервисы разбора за интерфейсами: в тестах они подменяются поддельными.
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { AiUsageKind } from "@/lib/generated/prisma/enums";

export type LlmRequest<T> = {
  kind: AiUsageKind;
  model: string;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: z.ZodType<T>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
};

export type LlmResult<T> = {
  data: T;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
};

export interface LlmClient {
  generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}

export type MediaResult = {
  transcript: string | null;
  audioSeconds: number;
  frames: string[]; // JPEG base64
};

export interface MediaProcessor {
  /** Скачивает видео, достаёт кадры и расшифровку речи. */
  process(videoUrl: string, durationSec: number | null): Promise<MediaResult>;
}

export type AiServices = { llm: LlmClient; media: MediaProcessor };
