// Инструкции для Claude и схемы ответов: проверка на пользу, разбор ролика, сценарий, правка.
import { z } from "zod";
import type { BrandMap } from "@/lib/generated/prisma/client";

export const HOOK_TYPES = ["вопрос", "провокация", "цифра", "я сделал X", "ошибка", "сравнение", "история", "обещание результата", "другое"] as const;

export const relevanceSchema = z.object({
  score: z.number().int().min(0).max(10).describe("Насколько ролик полезен проекту как референс, 0–10"),
  reason: z.string().describe("Одно короткое предложение: почему такая оценка"),
});

export const analysisSchema = z.object({
  hook: z.string().describe("Дословный хук: первые 1–3 секунды (слова и текст на экране)"),
  hookType: z.enum(HOOK_TYPES),
  structure: z.array(z.object({ block: z.string(), summary: z.string() })).describe("Блоки ролика по порядку: хук, проблема, решение, доказательство, призыв…"),
  techniques: z.array(z.string()).describe("Приёмы подачи и монтажа: текст на экране, смена планов, без лица, говорящая голова, скринкаст…"),
  cta: z.string().nullable().describe("Призыв к действию, если есть"),
  codeWord: z.string().nullable().describe("Кодовое слово из призыва («напиши ПЛАН»), если есть"),
  whyItWorked: z.array(z.string()).describe("2–3 причины, почему ролик залетел"),
  topic: z.string().describe("Тема в 2–5 словах"),
  format: z.string().describe("Формат: говорящая голова, скринкаст, сторителлинг, список, до/после…"),
  niche: z.string().describe("Ниша автора в 1–3 словах"),
  adaptationIdeas: z.array(z.string()).describe("2–3 конкретные идеи, как адаптировать ролик под проект"),
});

export const scriptSchema = z.object({
  title: z.string().describe("Рабочее название сценария"),
  hook: z.string().describe("Хук: что говорим и показываем в первые 1–3 секунды"),
  shots: z.array(z.object({ text: z.string().describe("Что говорим"), shoot: z.string().describe("Что снимать") })),
  ending: z.string().describe("Финал и призыв к действию"),
  caption: z.string().describe("Текст к выкладке (подпись под роликом)"),
});

export type RelevanceResult = z.infer<typeof relevanceSchema>;
export type AnalysisResult = z.infer<typeof analysisSchema>;
export type ScriptResult = z.infer<typeof scriptSchema>;

const field = (label: string, value: string | undefined) => (value?.trim() ? `${label}: ${value.trim()}` : null);

/** Карта бренда текстом. Порядок и формат стабильны — системный промпт кэшируется. */
export function brandContext(brand: BrandMap | null, projectName: string): string {
  const lines = [
    `Проект: ${projectName}`,
    field("Автор", brand?.author),
    field("Ниша", brand?.niche),
    field("Аудитория", brand?.audience),
    field("Продукты и цены", brand?.products),
    field("Тон", brand?.tone),
    field("Запрещено (слова, конструкции, темы)", brand?.forbidden),
    field("Нужные темы", brand?.topics),
    field("Ключевые слова", brand?.keywords),
    field("Не нужно", brand?.exclusions),
    field("Примеры удачных сценариев", brand?.examples),
  ].filter(Boolean);
  return lines.length > 1 ? lines.join("\n") : `${lines[0]}\n(Карта бренда пока не заполнена — оценивай по общей пользе для контент-маркетинга.)`;
}

export function relevanceSystem(brand: string): string {
  return `Ты помогаешь контент-маркетологу отбирать чужие залетевшие Reels как референсы для его проекта.
Оцени по подписи и расшифровке, насколько ролик полезен проекту: тема, аудитория, приём, который можно перенести.
10 — прямо в тему проекта; 6 — полезен приёмом или подачей, хотя тема другая; 0–3 — не по теме, мем без пользы, розыгрыш, накрутка или то, что проект просил исключить.

${brand}`;
}

export function analysisSystem(brand: string): string {
  return `Ты — аналитик коротких видео (Reels). Разбираешь залетевший чужой ролик, чтобы контент-маркетолог перенял приёмы.
Тебе дают метрики, подпись, расшифровку речи и кадры (начало, середина, финал). Текст на кадрах тоже учитывай.
Пиши по-русски, конкретно и коротко. Хук — дословно, как в ролике. Идеи адаптации — под проект ниже, с учётом его тона и запретов.

${brand}`;
}

export function scriptSystem(brand: string, template: string): string {
  return `Ты — сценарист Reels для проекта ниже. Пишешь сценарий короткого вертикального видео (30–60 секунд).
Формат: хук (первые 1–3 секунды) → кадры по порядку (что говорим + что снимать) → финал с призывом.
Пиши живым языком автора, по-русски, соблюдай тон и запреты проекта. Не копируй чужой ролик — переноси приём и структуру.
${template.trim() ? `\nШаблон сценария проекта (следуй ему):\n${template.trim()}\n` : ""}
${brand}`;
}
