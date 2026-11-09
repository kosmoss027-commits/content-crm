// Форматирование чисел и дат для интерфейса (по-русски).

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(".0", "")} млн`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(".0", "")} тыс`;
  return String(value);
}

export function formatMultiplier(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `×${value >= 10 ? Math.round(value) : value.toFixed(1).replace(".0", "")}`;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Almaty" });
}

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Almaty",
  });
}

export function formatAgo(date: Date, now = new Date()): string {
  const hours = Math.floor((now.getTime() - date.getTime()) / 3_600_000);
  if (hours < 1) return "только что";
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const total = Math.round(seconds);
  return total < 60 ? `${total} с` : `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 15000 → «15 000 ₽» */
export function formatRub(value: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} ₽`;
}
