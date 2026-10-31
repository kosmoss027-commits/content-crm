"use server";

import { revalidatePath } from "next/cache";
import { formText, runAction, type ActionState } from "@/lib/actions";
import { requireProjectContext } from "@/lib/auth/session";
import { archiveProject, createProject, restoreProject, updateProject } from "@/lib/db/projects";
import { renameWorkspace } from "@/lib/db/workspaces";

// projectId — текущий проект из URL: через него проверяем, что пользователь владелец этого пространства.

function projectFields(formData: FormData) {
  return { name: formText(formData, "name"), color: formText(formData, "color") || undefined };
}

export async function renameWorkspaceAction(projectId: string, _prev: ActionState, formData: FormData) {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await renameWorkspace(ctx, { name: formText(formData, "name") });
  });
  revalidatePath(`/p/${projectId}`, "layout");
  return result;
}

export async function createProjectAction(projectId: string, _prev: ActionState, formData: FormData) {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await createProject(ctx, projectFields(formData));
  }, "Проект создан");
  revalidatePath(`/p/${projectId}`, "layout");
  return result;
}

export async function updateProjectAction(
  projectId: string,
  targetProjectId: string,
  _prev: ActionState,
  formData: FormData,
) {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await updateProject(ctx, targetProjectId, projectFields(formData));
  });
  revalidatePath(`/p/${projectId}`, "layout");
  return result;
}

export async function archiveProjectAction(projectId: string, targetProjectId: string) {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await archiveProject(ctx, targetProjectId);
  }, "Проект в архиве");
  revalidatePath(`/p/${projectId}`, "layout");
  return result;
}

export async function restoreProjectAction(projectId: string, targetProjectId: string) {
  const result = await runAction(async () => {
    const ctx = await requireProjectContext(projectId);
    await restoreProject(ctx, targetProjectId);
  }, "Проект восстановлен");
  revalidatePath(`/p/${projectId}`, "layout");
  return result;
}
