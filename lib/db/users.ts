import { prisma } from "@/lib/db/prisma";

export type AuthIdentity = {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

export const DEFAULT_PROJECT_NAME = "Мой блог";
export const DEFAULT_WORKSPACE_NAME = "Моё пространство";

/** Создаёт пользователя при первом входе и обновляет email/имя, если они поменялись в Supabase. */
export async function syncUser(identity: AuthIdentity) {
  const existing = await prisma.user.findUnique({ where: { id: identity.id } });
  const name = identity.name ?? existing?.name ?? null;
  const avatarUrl = identity.avatarUrl ?? existing?.avatarUrl ?? null;

  if (existing && existing.email === identity.email && existing.name === name && existing.avatarUrl === avatarUrl) {
    return existing;
  }

  return prisma.user.upsert({
    where: { id: identity.id },
    create: { id: identity.id, email: identity.email, name, avatarUrl },
    update: { email: identity.email, name, avatarUrl },
  });
}

/**
 * Если у пользователя нет ни одного пространства, создаёт «Моё пространство»
 * с проектом «Мой блог» и делает его владельцем. Безопасно при параллельных запросах.
 */
export async function ensureDefaultWorkspace(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const existing = await tx.membership.findFirst({ where: { userId }, select: { id: true } });
    if (existing) return;

    await tx.workspace.create({
      data: {
        name: DEFAULT_WORKSPACE_NAME,
        memberships: { create: { userId, role: "OWNER" } },
        projects: { create: { name: DEFAULT_PROJECT_NAME } },
      },
    });
  });
}

/** Проект, куда вести пользователя после входа: последний открытый, если он ещё доступен, иначе первый. */
export async function findLandingProject(userId: string, preferredProjectId?: string) {
  const accessible = { archivedAt: null, workspace: { memberships: { some: { userId } } } };

  if (preferredProjectId) {
    const preferred = await prisma.project.findFirst({
      where: { id: preferredProjectId, ...accessible },
      select: { id: true },
    });
    if (preferred) return preferred.id;
  }

  const first = await prisma.project.findFirst({
    where: accessible,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}
