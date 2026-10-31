import type { Role } from "@/lib/generated/prisma/enums";
import { getPlan } from "@/config/plans";
import { prisma } from "@/lib/db/prisma";
import { AppError, notFoundError } from "@/lib/db/errors";
import { assertCan, type WorkspaceContext } from "@/lib/db/access";
import { parseInput, projectInput } from "@/lib/validation";

export type AccessibleProject = {
  id: string;
  name: string;
  color: string;
  workspaceId: string;
  workspaceName: string;
  role: Role;
};

/** Все активные проекты во всех пространствах пользователя — для переключателя в шапке. */
export async function listAccessibleProjects(userId: string): Promise<AccessibleProject[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          projects: {
            where: { archivedAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, color: true },
          },
        },
      },
    },
  });

  return memberships.flatMap(({ role, workspace }) =>
    workspace.projects.map((project) => ({
      ...project,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      role,
    })),
  );
}

/** Все проекты пространства, включая архивные — для настроек. */
export async function listWorkspaceProjects(ctx: WorkspaceContext) {
  assertCan(ctx, "project.manage");
  return prisma.project.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
  });
}

export async function countActiveProjects(workspaceId: string): Promise<number> {
  return prisma.project.count({ where: { workspaceId, archivedAt: null } });
}

async function assertProjectLimit(ctx: WorkspaceContext): Promise<void> {
  const limit = getPlan(ctx.workspace.plan).projects;
  if (limit === null) return;
  if ((await countActiveProjects(ctx.workspaceId)) >= limit) {
    throw new AppError("LIMIT", `На вашем тарифе можно вести не больше ${limit} проектов.`);
  }
}

export async function createProject(ctx: WorkspaceContext, input: unknown) {
  assertCan(ctx, "project.manage");
  const data = parseInput(projectInput, input);
  await assertProjectLimit(ctx);
  return prisma.project.create({ data: { ...data, workspaceId: ctx.workspaceId } });
}

export async function updateProject(ctx: WorkspaceContext, projectId: string, input: unknown) {
  assertCan(ctx, "project.manage");
  const data = parseInput(projectInput, input);
  const { count } = await prisma.project.updateMany({
    where: { id: projectId, workspaceId: ctx.workspaceId },
    data,
  });
  if (count === 0) throw notFoundError();
}

export async function archiveProject(ctx: WorkspaceContext, projectId: string) {
  assertCan(ctx, "project.manage");
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: ctx.workspaceId, archivedAt: null },
    select: { id: true },
  });
  if (!project) throw notFoundError();
  if ((await countActiveProjects(ctx.workspaceId)) <= 1) {
    throw new AppError("CONFLICT", "Нельзя архивировать последний активный проект.");
  }
  await prisma.project.update({ where: { id: project.id }, data: { archivedAt: new Date() } });
}

export async function restoreProject(ctx: WorkspaceContext, projectId: string) {
  assertCan(ctx, "project.manage");
  await assertProjectLimit(ctx);
  const { count } = await prisma.project.updateMany({
    where: { id: projectId, workspaceId: ctx.workspaceId, archivedAt: { not: null } },
    data: { archivedAt: null },
  });
  if (count === 0) throw notFoundError();
}
