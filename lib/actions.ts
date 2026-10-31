import { unstable_rethrow } from "next/navigation";
import { AppError } from "@/lib/db/errors";

/** Результат server action для форм: ошибка или сообщение об успехе. */
export type ActionState = { ok: boolean; message: string } | null;

/**
 * Выполняет действие и превращает ошибки в понятное сообщение.
 */
export async function runAction(fn: () => Promise<void>, successMessage = "Сохранено"): Promise<ActionState> {
  try {
    await fn();
    return { ok: true, message: successMessage };
  } catch (error) {
    unstable_rethrow(error); // redirect() и notFound() Next.js должны пройти дальше
    if (error instanceof AppError) return { ok: false, message: error.message };
    console.error("Ошибка server action:", error);
    return { ok: false, message: "Что-то пошло не так. Попробуйте ещё раз." };
  }
}

export function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
