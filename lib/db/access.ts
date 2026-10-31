// Проверка доступа. Любой запрос к данным проекта начинается с getProjectContext:
// он подтверждает, что пользователь — участник пространства, которому принадлежит проект.
// Дальше все запросы фильтруются по ctx.workspaceId / ctx.projectId, а не по id из URL.
import type { Role } from "@/lib/generated/prisma/enums";
import { can, type Action } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { forbiddenError, notFoundError } from "@/lib/db/errors";

export type WorkspaceContext = {
  userId: string;
  workspaceId: string;
  role: Role;
  workspace: { id: string; name: string; plan: string };
};

export type ProjectContext = WorkspaceContext & {
  projectId: string;
  project: { id: string; name: string; color: string };
};

export async function getWorkspaceContext(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: { select: { id: true, name: true, plan: true } } },
  });
  if (!membership) throw notFoundError();

  return { userId, workspaceId, role: membership.role, workspace: membership.workspace };
}

export async function getProjectContext(userId: string, projectId: string): Promise<ProjectContext> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, archivedAt: null, workspace: { memberships: { some: { userId } } } },
    select: {
      id: true,
      name: true,
      color: true,
      workspace: {
        select: {
          id: true,
          name: true,
          plan: true,
          memberships: { where: { userId }, select: { role: true } },
        },
      },
    },
  });
  const role = project?.workspace.memberships[0]?.role;
  if (!project || !role) throw notFoundError();

  const workspace = { id: project.workspace.id, name: project.workspace.name, plan: project.workspace.plan };
  return {
    userId,
    workspaceId: workspace.id,
    role,
    workspace,
    projectId: project.id,
    project: { id: project.id, name: project.name, color: project.color },
  };
}

export function assertCan(ctx: WorkspaceContext, action: Action): void {
  if (!can(ctx.role, action)) throw forbiddenError();
}
