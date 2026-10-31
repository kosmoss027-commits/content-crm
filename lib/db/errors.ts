// Ошибки слоя данных. Сообщение показывается пользователю как есть, поэтому оно на русском.
export type AppErrorCode = "NOT_FOUND" | "FORBIDDEN" | "LIMIT" | "VALIDATION" | "CONFLICT";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundError = () => new AppError("NOT_FOUND", "Не найдено или нет доступа.");
export const forbiddenError = () => new AppError("FORBIDDEN", "Недостаточно прав для этого действия.");
