// Запуск конвейера разбора с настоящими сервисами. Один запуск за раз на процесс.
import { claudeClient } from "@/lib/ai/claude";
import { ffmpegMediaProcessor } from "@/lib/ai/media";
import { openRouterClient } from "@/lib/ai/openrouter";
import { scraper } from "@/scraper";
import { runAiPipeline, type PipelineReport } from "@/lib/ai/pipeline";
import type { AiServices, LlmClient } from "@/lib/ai/types";

/** Провайдер Claude: напрямую от Anthropic, если есть их ключ, иначе через OpenRouter. */
export function activeLlm(): LlmClient | null {
  if (process.env.ANTHROPIC_API_KEY) return claudeClient;
  if (process.env.OPENROUTER_API_KEY) return openRouterClient;
  return null;
}

export function isAiConfigured(): boolean {
  return activeLlm() !== null;
}

let running: Promise<PipelineReport> | null = null;

/** Если конвейер уже идёт, второй не запускается — вернётся текущий. */
export function runAiPipelineOnce(): Promise<PipelineReport> | null {
  const llm = activeLlm();
  if (!llm) return null;
  const services: AiServices = { llm, media: ffmpegMediaProcessor, scraper };
  running ??= runAiPipeline(services)
    .catch((error) => {
      console.error("Конвейер разбора упал:", error);
      return { queued: 0, processed: 0, drafts: 0, stoppedByLimit: false };
    })
    .finally(() => {
      running = null;
    });
  return running;
}
