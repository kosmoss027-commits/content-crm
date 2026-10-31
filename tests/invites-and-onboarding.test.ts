import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getProjectContext, getWorkspaceContext } from "@/lib/db/access";
import { AppError } from "@/lib/db/errors";
import { acceptInvite, createInvite } from "@/lib/db/invites";
import { listAccessibleProjects } from "@/lib/db/projects";
import { DEFAULT_PROJECT_NAME, ensureDefaultWorkspace, findLandingProject } from "@/lib/db/users";
import { safeNextPath } from "@/lib/auth/redirect";
import { createUser, createWorkspace, resetDatabase } from "./helpers";

const expectCode = (code: AppError["code"]) => expect.objectContaining({ name: "AppError", code });

describe("приглашения", () => {
  beforeEach(resetDatabase);

  async function setup() {
    const owner = await createUser("owner@test.ru");
    const guest = await createUser("guest@test.ru");
    const ws = await createWorkspace(owner, ["Проект"]);
    const ctx = await getWorkspaceContext(owner.id, ws.id);
    return { owner, guest, ws, ctx };
  }

  it("приглашённый получает доступ с ролью из приглашения", async () => {
    const { guest, ws, ctx } = await setup();
    const invite = await createInvite(ctx, { email: "Guest@Test.ru", role: "SMM" });

    await acceptInvite(guest, invite.token);

    const projectCtx = await getProjectContext(guest.id, ws.projects[0].id);
    expect(projectCtx.role).toBe("SMM");
  });

  it("принять приглашение может только тот email, на который оно выписано", async () => {
    const { ctx } = await setup();
    const stranger = await createUser("stranger@test.ru");
    const invite = await createInvite(ctx, { email: "guest@test.ru", role: "SMM" });

    await expect(acceptInvite(stranger, invite.token)).rejects.toEqual(expectCode("FORBIDDEN"));
  });

  it("приглашение одноразовое и с ограниченным сроком", async () => {
    const { guest, ctx } = await setup();
    const invite = await createInvite(ctx, { email: "guest@test.ru", role: "SMM" });
    await acceptInvite(guest, invite.token);
    await expect(acceptInvite(guest, invite.token)).rejects.toEqual(expectCode("NOT_FOUND"));

    const expired = await createInvite(ctx, { email: "late@test.ru", role: "SMM" });
    await prisma.invite.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const late = await createUser("late@test.ru");
    await expect(acceptInvite(late, expired.token)).rejects.toEqual(expectCode("CONFLICT"));
  });

  it("нельзя пригласить того, кто уже в команде", async () => {
    const { ctx } = await setup();
    await expect(createInvite(ctx, { email: "owner@test.ru", role: "SMM" })).rejects.toEqual(expectCode("CONFLICT"));
  });
});

describe("первый вход", () => {
  beforeEach(resetDatabase);

  it("создаёт одно пространство с проектом «Мой блог», даже при параллельных запросах", async () => {
    const user = await createUser("new@test.ru");

    await Promise.all([ensureDefaultWorkspace(user.id), ensureDefaultWorkspace(user.id), ensureDefaultWorkspace(user.id)]);

    const memberships = await prisma.membership.findMany({ where: { userId: user.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("OWNER");
    const projects = await listAccessibleProjects(user.id);
    expect(projects.map((p) => p.name)).toEqual([DEFAULT_PROJECT_NAME]);
  });

  it("после входа ведёт в последний проект, только если он ещё доступен", async () => {
    const user = await createUser("u@test.ru");
    const other = await createUser("o@test.ru");
    const ws = await createWorkspace(user, ["Первый", "Второй"]);
    const foreign = await createWorkspace(other, ["Чужой"]);

    expect(await findLandingProject(user.id, ws.projects[1].id)).toBe(ws.projects[1].id);
    expect(await findLandingProject(user.id, foreign.projects[0].id)).toBe(ws.projects[0].id);
  });
});

describe("редирект после входа", () => {
  it("пропускает только внутренние пути", () => {
    expect(safeNextPath("/p/123/today")).toBe("/p/123/today");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});
