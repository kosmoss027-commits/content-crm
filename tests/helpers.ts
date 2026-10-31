import { randomUUID } from "node:crypto";
import type { Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Invite", "Membership", "Project", "Workspace", "User" RESTART IDENTITY CASCADE',
  );
}

export async function createUser(email: string) {
  return prisma.user.create({ data: { id: randomUUID(), email, name: email.split("@")[0] } });
}

/** Пространство с проектами; владелец + дополнительные участники с ролями. */
export async function createWorkspace(
  owner: { id: string },
  projectNames: string[],
  members: { userId: string; role: Role }[] = [],
) {
  return prisma.workspace.create({
    data: {
      name: `WS ${projectNames[0]}`,
      memberships: { create: [{ userId: owner.id, role: "OWNER" }, ...members] },
      projects: { create: projectNames.map((name) => ({ name })) },
    },
    include: { projects: { orderBy: { createdAt: "asc" } } },
  });
}
