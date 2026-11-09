// Продажи: источники и статусы заявок. Единственное место, где заданы их названия.

export const LEAD_SOURCES = [
  { value: "COMMENT", label: "Комментарий" },
  { value: "DIRECT", label: "Директ" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "OTHER", label: "Другое" },
] as const;

export const LEAD_STATUSES = [
  { value: "NEW", label: "Новая" },
  { value: "IN_PROGRESS", label: "В работе" },
  { value: "CLIENT", label: "Клиент" },
  { value: "LOST", label: "Отказ" },
] as const;

export const SOURCE_LABEL: Record<string, string> = Object.fromEntries(LEAD_SOURCES.map((s) => [s.value, s.label]));
