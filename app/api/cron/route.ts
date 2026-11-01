import { after, NextResponse, type NextRequest } from "next/server";
import { isAiConfigured, runAiPipelineOnce } from "@/lib/ai/run";
import { runCron } from "@/lib/research/cron";
import { secretMatches } from "@/lib/secrets";

// Раз в час дёргается из GitHub Actions (.github/workflows/cron.yml) с заголовком Authorization: Bearer CRON_SECRET.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretMatches(token, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const report = await runCron();
    // Разбор роликов может идти минутами — продолжаем после ответа, чтобы запрос планировщика не обрывался.
    after(() => runAiPipelineOnce() ?? undefined);
    return NextResponse.json({ ok: true, ...report, ai: isAiConfigured() ? "started" : "not configured" });
  } catch (error) {
    console.error("Cron: ошибка", error);
    return NextResponse.json({ error: "cron failed" }, { status: 500 });
  }
}
