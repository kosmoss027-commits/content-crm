// Кадры (ffmpeg) и расшифровка речи (Deepgram) для разбора ролика.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { MediaProcessor, MediaResult } from "@/lib/ai/types";

const run = promisify(execFile);
const FRAME_POSITIONS = [0.02, 0.3, 0.6, 0.9]; // доли длительности: начало (хук), середина, финал
const FRAME_WIDTH = 512;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Видео не скачалось (${response.status}): ссылка Instagram могла устареть.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_VIDEO_BYTES) throw new Error("Видео слишком большое для разбора.");
  return buffer;
}

async function extractFrames(videoPath: string, dir: string, durationSec: number): Promise<string[]> {
  if (!ffmpegPath) throw new Error("ffmpeg не найден на сервере.");
  const frames: string[] = [];
  for (const [index, position] of FRAME_POSITIONS.entries()) {
    const out = path.join(dir, `frame-${index}.jpg`);
    const at = Math.max(0.1, durationSec * position).toFixed(2);
    await run(ffmpegPath, ["-y", "-ss", at, "-i", videoPath, "-frames:v", "1", "-vf", `scale=${FRAME_WIDTH}:-2`, "-q:v", "5", out]);
    frames.push((await readFile(out)).toString("base64"));
  }
  return frames;
}

async function transcribe(video: Buffer): Promise<{ text: string | null; seconds: number }> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY не задан: расшифровка речи недоступна.");
  const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&detect_language=true&smart_format=true", {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "video/mp4" },
    body: new Uint8Array(video),
  });
  if (!response.ok) throw new Error(`Deepgram ответил ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = (await response.json()) as {
    metadata?: { duration?: number };
    results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
  };
  const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || null;
  return { text, seconds: json.metadata?.duration ?? 0 };
}

export const ffmpegMediaProcessor: MediaProcessor = {
  async process(videoUrl: string, durationSec: number | null): Promise<MediaResult> {
    const dir = await mkdtemp(path.join(tmpdir(), "reel-"));
    try {
      const video = await download(videoUrl);
      const videoPath = path.join(dir, "video.mp4");
      await writeFile(videoPath, video);
      const [frames, speech] = await Promise.all([extractFrames(videoPath, dir, durationSec ?? 15), transcribe(video)]);
      return { transcript: speech.text, audioSeconds: speech.seconds, frames };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};
