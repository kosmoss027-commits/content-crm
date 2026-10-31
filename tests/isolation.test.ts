// Главное требование ТЗ: пользователь никогда не видит и не меняет чужие данные.
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getProjectContext, getWorkspaceContext } from "@/lib/db/access";
import { AppError } from "@/lib/db/errors";
import {
  archiveProject,
  createProject,
  listAccessibleProjects,
  listWorkspaceProjects,
  updateProject,
} from "@/lib/db/projects";
import { changeMemberRole, listMembers, removeMember } from "@/lib/db/members";
import { createInvite, revokeInvite } from "@/lib/db/invites";
import { createUser, createWorkspace, resetDatabase } from "./helpers";

async function setup() {
  const alice = await createUser("alice@test.ru");
  const bob = await createUser("bob@test.ru");
  const aliceWs = await createWorkspace(alice, ["Блог Алисы", "Клиент Алисы"]);
  const bobWs = await createWorkspace(bob, ["Блог Боба"]);
  return { alice, bob, aliceWs, bobWs, bobProject: bobWs.projects[0] };
}

const expectCode = (code: AppError["code"]) => expect.objectContaining({ name: "AppError", code });

describe("изоляция данных между пространствами", () => {
  beforeEach(resetDatabase);

  it("переключатель проектов показывает только свои проекты", async () => {
    const { alice } = await setup();
    const projects = await listAccessibleProjects(alice.id);
    expect(projects.map((p) => p.name).sort()).toEqual(["Блог Алисы", "Клиент Алисы"]);
  });

  it("нельзя открыть чужой проект, даже зная его id", async () => {
    const { alice, bobProject } = await setup();
    await expect(getProjectContext(alice.id, bobProject.id)).rejects.toEqual(expectCode("NOT_FOUND"));
  });

  it("нельзя открыть чужое пространство", async () => {
    const { alice, bobWs } = await setup();
    await expect(getWorkspaceContext(alice.id, bobWs.id)).rejects.toEqual(expectCode("NOT_FOUND"));
  });

  it("нельзя переименовать или архивировать чужой проект через своё пространство", async () => {
    const { alice, aliceWs, bobProject } = await setup();
    const ctx = await getWorkspaceContext(alice.id, aliceWs.id);

    await expect(updateProject(ctx, bobProject.id, { name: "Взлом" })).rejects.toEqual(expectCode("NOT_FOUND"));
    await expect(archiveProject(ctx, bobProject.id)).rejects.toEqual(expectCode("NOT_FOUND"));

    const untouched = await prisma.project.findUniqueOrThrow({ where: { id: bobProject.id } });
    expect(untouched.name).toBe("Блог Боба");
    expect(untouched.archivedAt).toBeNull();
  });

  it("список проектов и участников пространства не содержит чужих", async () => {
    const { alice, aliceWs } = await setup();
    const ctx = await getWorkspaceContext(alice.id, aliceWs.id);

    const projects = await listWorkspaceProjects(ctx);
    expect(projects.every((p) => p.workspaceId === aliceWs.id)).toBe(true);

    const members = await listMembers(ctx);
    expect(members.map((m) => m.user.email)).toEqual(["alice@test.ru"]);
  });

  it("нельзя менять роль, удалять участников и приглашения чужого пространства", async () => {
    const { alice, aliceWs, bob, bobWs } = await setup();
    const ctx = await getWorkspaceContext(alice.id, aliceWs.id);
    const bobMembership = await prisma.membership.findFirstOrThrow({ where: { workspaceId: bobWs.id } });
    const bobCtx = await getWorkspaceContext(bob.id, bobWs.id);
    const bobInvite = await createInvite(bobCtx, { email: "x@test.ru", role: "SMM" });

    await expect(changeMemberRole(ctx, bobMembership.id, "SMM")).rejects.toEqual(expectCode("NOT_FOUND"));
    await expect(removeMember(ctx, bobMembership.id)).rejects.toEqual(expectCode("NOT_FOUND"));
    await expect(revokeInvite(ctx, bobInvite.id)).rejects.toEqual(expectCode("NOT_FOUND"));
  });

  it("новый проект создаётся только в своём пространстве", async () => {
    const { alice, aliceWs } = await setup();
    const ctx = await getWorkspaceContext(alice.id, aliceWs.id);
    const project = await createProject(ctx, { name: "Новый", workspaceId: "чужой" });
    expect(project.workspaceId).toBe(aliceWs.id);
  });

  it("архивный проект недоступен для работы", async () => {
    const { alice, aliceWs } = await setup();
    const ctx = await getWorkspaceContext(alice.id, aliceWs.id);
    const project = aliceWs.projects[1];
    await archiveProject(ctx, project.id);
    await expect(getProjectContext(alice.id, project.id)).rejects.toEqual(expectCode("NOT_FOUND"));
  });
});

describe("роли внутри пространства", () => {
  beforeEach(resetDatabase);

  it("SMM и менеджер не могут управлять проектами и командой", async () => {
    const owner = await createUser("owner@test.ru");
    const smm = await createUser("smm@test.ru");
    const manager = await createUser("manager@test.ru");
    const ws = await createWorkspace(owner, ["Проект"], [
      { userId: smm.id, role: "SMM" },
      { userId: manager.id, role: "MANAGER" },
    ]);

    for (const user of [smm, manager]) {
      const ctx = await getWorkspaceContext(user.id, ws.id);
      await expect(createProject(ctx, { name: "X" })).rejects.toEqual(expectCode("FORBIDDEN"));
      await expect(updateProject(ctx, ws.projects[0].id, { name: "X" })).rejects.toEqual(expectCode("FORBIDDEN"));
      await expect(createInvite(ctx, { email: "a@test.ru", role: "OWNER" })).rejects.toEqual(expectCode("FORBIDDEN"));
    }
  });

  it("участник видит проект с правильной ролью", async () => {
    const owner = await createUser("owner@test.ru");
    const smm = await createUser("smm@test.ru");
    const ws = await createWorkspace(owner, ["Проект"], [{ userId: smm.id, role: "SMM" }]);
    const ctx = await getProjectContext(smm.id, ws.projects[0].id);
    expect(ctx.role).toBe("SMM");
    expect(ctx.workspaceId).toBe(ws.id);
  });

  it("нельзя оставить пространство без владельца", async () => {
    const owner = await createUser("owner@test.ru");
    const ws = await createWorkspace(owner, ["Проект"]);
    const ctx = await getWorkspaceContext(owner.id, ws.id);
    const membership = await prisma.membership.findFirstOrThrow({ where: { workspaceId: ws.id } });

    await expect(changeMemberRole(ctx, membership.id, "SMM")).rejects.toEqual(expectCode("CONFLICT"));
    await expect(removeMember(ctx, membership.id)).rejects.toEqual(expectCode("CONFLICT"));
  });
});
