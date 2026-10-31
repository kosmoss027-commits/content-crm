// Права ролей. Единственное место, где решается, кто что видит и может делать.
import type { Role } from "@/lib/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Владелец",
  MANAGER: "Менеджер",
  ASSISTANT: "Ассистент",
  SMM: "SMM",
};

export const ROLES: Role[] = ["OWNER", "MANAGER", "ASSISTANT", "SMM"];

/** Действия, которые проверяются на сервере перед изменением данных. */
export type Action =
  | "project.manage" // создать, переименовать, архивировать проект
  | "member.manage" // пригласить, сменить роль, удалить участника
  | "settings.view";

const ACTIONS: Record<Action, Role[]> = {
  "project.manage": ["OWNER"],
  "member.manage": ["OWNER"],
  "settings.view": ["OWNER"],
};

export function can(role: Role, action: Action): boolean {
  return ACTIONS[action].includes(role);
}

/** Группы разделов по ролям (ТЗ п. 5.7). */
const CONTENT_ROLES: Role[] = ["OWNER", "ASSISTANT", "SMM"];
const SALES_ROLES: Role[] = ["OWNER", "MANAGER"];
const EVERYONE: Role[] = ["OWNER", "MANAGER", "ASSISTANT", "SMM"];

export const SECTION_ROLES = {
  content: CONTENT_ROLES,
  sales: SALES_ROLES,
  everyone: EVERYONE,
  owner: ["OWNER"] as Role[],
};
