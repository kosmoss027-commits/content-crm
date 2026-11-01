import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncRun } from "@/lib/research/ingest";
import { secretMatches } from "@/lib/secrets";

// Apify вызывает этот адрес, когда сбор закончился. Принимаем только с секретом из APIFY_WEBHOOK_SECRET.
export async function POST(request: NextRequest) {
  if (!secretMatches(request.nextUrl.searchParams.get("secret"), process.env.APIFY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as { resource?: { id?: string } } | null;
  const apifyRunId = payload?.resource?.id;
  if (!apifyRunId) return NextResponse.json({ error: "no run id" }, { status: 400 });

  const run = await prisma.scrapeRun.findUnique({ where: { apifyRunId } });
  if (!run) return NextResponse.json({ ok: true, ignored: true });

  try {
    await syncRun(run);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook Apify: не удалось забрать результат", error);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
