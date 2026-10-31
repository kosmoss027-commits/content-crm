/** Пропускает только внутренние пути вида /p/..., чтобы ссылкой нельзя было увести на чужой сайт. */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
