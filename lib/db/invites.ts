import { randomBytes } from "node:crypto";
import { getPlan } from "@/config/plans";
import { prisma } from "@/lib/db/prisma";
import { AppError, notFoundError } from "@/lib/db/errors";
import { assertCan, type WorkspaceContext } from "@/lib/db/access";
import { inviteInput, parseInput } from "@/lib/validation";

const INVITE_TTL_DAYS = 7;

export async function listPendingInvites(ctx: WorkspaceContext) {
  assertCan(ctx, "member.manage");
  return prisma.invite.findMany({
    where: { workspaceId: ctx.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, token: true, expiresAt: true },
  });
}

async function assertMemberLimit(ctx: WorkspaceContext): Promise<void> {
  const limit = getPlan(ctx.workspace.plan).members;
  if (limit === null) return;
  const [members, pending] = await Promise.all([
    prisma.membership.count({ where: { workspaceId: ctx.workspaceId } }),
    prisma.invite.count({
      where: { workspaceId: ctx.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  if (members + pending >= limit) {
    throw new AppError("LIMIT", `На вашем тарифе не больше ${limit} участников, включая приглашённых.`);
  }
}

/** Создаёт приглашение. Повторное приглашение того же email заменяет старое. */
export async function createInvite(ctx: WorkspaceContext, input: unknown) {
  assertCan(ctx, "member.manage");
  const { email, role } = parseInput(inviteInput, input);

  const alreadyMember = await prisma.membership.findFirst({
    where: { workspaceId: ctx.workspaceId, user: { email: { equals: email, mode: "insensitive" } } },
    select: { id: true },
  });
  if (alreadyMember) throw new AppError("CONFLICT", "Этот человек уже в команде.");

  await prisma.invite.deleteMany({ where: { workspaceId: ctx.workspaceId, email, acceptedAt: null } });
  await assertMemberLimit(ctx);

  return prisma.invite.create({
    data: {
      workspaceId: ctx.workspaceId,
      email,
      role,
      token: randomBytes(24).toString("base64url"),
      invitedById: ctx.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
}

export async function revokeInvite(ctx: WorkspaceContext, inviteId: string) {
  assertCan(ctx, "member.manage");
  const { count } = await prisma.invite.deleteMany({
    where: { id: inviteId, workspaceId: ctx.workspaceId, acceptedAt: null },
  });
  if (count === 0) throw notFoundError();
}

/** Данные приглашения для страницы /invite/<token>. Токен сам по себе и есть доступ к этой странице. */
export async function getInviteByToken(token: string) {
  return prisma.invite.findUnique({
    where: { token },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      workspace: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
}

/** Принимает приглашение. Email вошедшего пользователя должен совпадать с приглашённым. */
export async function acceptInvite(user: { id: string; email: string }, token: string): Promise<string> {
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt) throw new AppError("NOT_FOUND", "Приглашение не найдено или уже использовано.");
  if (invite.expiresAt < new Date()) throw new AppError("CONFLICT", "Срок приглашения истёк. Попросите прислать новое.");
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError("FORBIDDEN", `Приглашение отправлено на ${invite.email}. Войдите с этим email.`);
  }

  await prisma.$transaction([
    prisma.membership.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
      create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role },
      update: {},
    }),
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);

  return invite.workspaceId;
}
