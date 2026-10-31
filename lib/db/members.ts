import type { Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { AppError, notFoundError } from "@/lib/db/errors";
import { assertCan, type WorkspaceContext } from "@/lib/db/access";
import { parseInput, roleSchema } from "@/lib/validation";

/** Участники пространства. Видны всем участникам. */
export async function listMembers(ctx: WorkspaceContext) {
  return prisma.membership.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true, avatarUrl: true } },
    },
  });
}

export async function countMembers(workspaceId: string): Promise<number> {
  return prisma.membership.count({ where: { workspaceId } });
}

async function findMembership(ctx: WorkspaceContext, membershipId: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, workspaceId: ctx.workspaceId },
    select: { id: true, role: true },
  });
  if (!membership) throw notFoundError();
  return membership;
}

async function assertNotLastOwner(workspaceId: string, currentRole: Role): Promise<void> {
  if (currentRole !== "OWNER") return;
  const owners = await prisma.membership.count({ where: { workspaceId, role: "OWNER" } });
  if (owners <= 1) {
    throw new AppError("CONFLICT", "В пространстве должен остаться хотя бы один владелец.");
  }
}

export async function changeMemberRole(ctx: WorkspaceContext, membershipId: string, roleInput: unknown) {
  assertCan(ctx, "member.manage");
  const role = parseInput(roleSchema, roleInput);
  const membership = await findMembership(ctx, membershipId);
  if (membership.role === role) return;
  if (role !== "OWNER") await assertNotLastOwner(ctx.workspaceId, membership.role);
  await prisma.membership.update({ where: { id: membership.id }, data: { role } });
}

export async function removeMember(ctx: WorkspaceContext, membershipId: string) {
  assertCan(ctx, "member.manage");
  const membership = await findMembership(ctx, membershipId);
  await assertNotLastOwner(ctx.workspaceId, membership.role);
  await prisma.membership.delete({ where: { id: membership.id } });
}
