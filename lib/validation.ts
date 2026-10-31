import { z } from "zod";
import { AppError } from "@/lib/db/errors";

export const projectInput = z.object({
  name: z.string().trim().min(1, "Введите название проекта").max(60, "Не длиннее 60 символов"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Цвет в формате #RRGGBB")
    .default("#6366f1"),
});

export const workspaceInput = z.object({
  name: z.string().trim().min(1, "Введите название").max(60, "Не длиннее 60 символов"),
});

export const roleSchema = z.enum(["OWNER", "MANAGER", "ASSISTANT", "SMM"]);

export const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный email"),
  role: roleSchema,
});

/** Проверяет данные по схеме; при ошибке бросает AppError с первым сообщением. */
export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION", result.error.issues[0]?.message ?? "Некорректные данные");
  }
  return result.data;
}
