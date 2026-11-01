import { timingSafeEqual } from "node:crypto";

/** Сравнение секрета без утечки по времени. Пустой ожидаемый секрет — всегда отказ. */
export function secretMatches(received: string | null | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
