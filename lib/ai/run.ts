// Запуск конвейера разбора с настоящими сервисами. Один запуск за раз на процесс.
import { claudeClient } from "@/lib/ai/claude";
import { ffmpegMediaProcessor } from "@/lib/ai/media";
import { runAiPipeline, type PipelineReport } from "@/lib/ai/pipeline";
import type { AiServices } from "@/lib/ai/types";

export const realAiServices: AiServices = { llm: claudeClient, media: ffmpegMediaProcessor };

let running: Promise<PipelineReport> | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Если конвейер уже идёт, второй не запускается — вернётся текущий. */
export function runAiPipelineOnce(): Promise<PipelineReport> | null {
  if (!isAiConfigured()) return null;
  running ??= runAiPipeline(realAiServices)
    .catch((error) => {
      console.error("Конвейер разбора упал:", error);
      return { queued: 0, processed: 0, drafts: 0, stoppedByLimit: false };
    })
    .finally(() => {
      running = null;
    });
  return running;
}
