"use server";

import { revalidatePath } from "next/cache";
import { formText, runAction, type ActionState } from "@/lib/actions";
import { requireProjectContext } from "@/lib/auth/session";
import { createInvite, revokeInvite } from "@/lib/db/invites";
import { changeMemberRole, removeMember } from "@/lib/db/members";

// Все действия получают projectId из URL и проверяют доступ заново: данным из формы не доверяем.

export async function inviteMemberAction(projectId: string, _prev: ActionState, formData: FormData) {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await createInvite(ctx, { email: formText(formData, "email"), role: formText(formData, "role") });
  }, "Приглашение создано. Скопируйте ссылку и отправьте её человеку.");
  revalidatePath(`/p/${projectId}/team`);
  return result;
}

export async function changeRoleAction(projectId: string, membershipId: string, role: string) {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await changeMemberRole(ctx, membershipId, role);
  }, "Роль изменена");
  revalidatePath(`/p/${projectId}`, "layout");
  return result;
}

export async function removeMemberAction(projectId: string, membershipId: string) {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await removeMember(ctx, membershipId);
  }, "Участник удалён");
  revalidatePath(`/p/${projectId}/team`);
  return result;
}

export async function revokeInviteAction(projectId: string, inviteId: string) {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await revokeInvite(ctx, inviteId);
  }, "Приглашение отозвано");
  revalidatePath(`/p/${projectId}/team`);
  return result;
}
