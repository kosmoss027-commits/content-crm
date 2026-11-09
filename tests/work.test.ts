import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getProjectContext } from "@/lib/db/access";
import { AppError } from "@/lib/db/errors";
import { createPublication, getPublication } from "@/lib/db/publications";
import { createClient } from "@/lib/db/sales";
import { createCampaign, getCampaign, saveWarmupDay, updateCampaign } from "@/lib/db/warmups";
import { bucketTasks, createTask, deleteTask, listTasks, myUpcomingTasks, openTaskCounts, setTaskStatus } from "@/lib/db/tasks";
import { createUser, createWorkspace, resetDatabase } from "./helpers";

const expectCode = (code: AppError["code"]) => expect.objectContaining({ name: "AppError", code });

async function setup() {
  const owner = await createUser("owner@test.ru");
  const manager = await createUser("manager@test.ru");
  const smm = await createUser("smm@test.ru");
  const stranger = await createUser("stranger@test.ru");
  const ws = await createWorkspace(owner, ["Блог"], [
    { userId: manager.id, role: "MANAGER" },
    { userId: smm.id, role: "SMM" },
  ]);
  const other = await createWorkspace(stranger, ["Чужой"]);
  const projectId = ws.projects[0].id;
  return {
    owner,
    manager,
    smm,
    stranger,
    ownerCtx: await getProjectContext(owner.id, projectId),
    managerCtx: await getProjectContext(manager.id, projectId),
    smmCtx: await getProjectContext(smm.id, projectId),
    strangerCtx: await getProjectContext(stranger.id, other.projects[0].id),
  };
}

describe("прогревы", () => {
  beforeEach(resetDatabase);

  it("кампания: права, период, дни только внутри периода, пустой день удаляется", async () => {
    const { ownerCtx, managerCtx, strangerCtx } = await setup();
    const base = { name: "Прогрев к наставничеству", startDate: "2026-12-01", endDate: "2026-12-28", salesStartDate: "2026-12-25" };
    await expect(createCampaign(managerCtx, base)).rejects.toEqual(expectCode("FORBIDDEN"));
    await expect(createCampaign(ownerCtx, { ...base, endDate: "2026-11-01" })).rejects.toEqual(expectCode("VALIDATION"));
    await expect(createCampaign(ownerCtx, { ...base, endDate: "2027-06-01" })).rejects.toEqual(expectCode("VALIDATION"));
    await expect(createCampaign(ownerCtx, { ...base, salesStartDate: "2027-01-10" })).rejects.toEqual(expectCode("VALIDATION"));
    await expect(createCampaign(ownerCtx, { ...base, startDate: "2026-02-31" })).rejects.toEqual(expectCode("VALIDATION"));
    const campaign = await createCampaign(ownerCtx, base);

    await saveWarmupDay(ownerCtx, campaign.id, "2026-12-05", { kind: "LIVE", meaning: "эфир про старт", meanings: ["FOMO", "PRODUCT"] });
    await expect(saveWarmupDay(ownerCtx, campaign.id, "2027-01-05", { meaning: "вне" })).rejects.toEqual(expectCode("VALIDATION"));
    await expect(saveWarmupDay(ownerCtx, campaign.id, "2026-12-06", { meanings: ["ЛЕВЫЙ"] })).rejects.toEqual(expectCode("VALIDATION"));
    await expect(saveWarmupDay(strangerCtx, campaign.id, "2026-12-05", { meaning: "x" })).rejects.toEqual(expectCode("NOT_FOUND"));
    expect((await getCampaign(ownerCtx, campaign.id)).days).toEqual([expect.objectContaining({ kind: "LIVE", meanings: ["FOMO", "PRODUCT"] })]);

    await saveWarmupDay(ownerCtx, campaign.id, "2026-12-05", {});
    expect((await getCampaign(ownerCtx, campaign.id)).days).toEqual([]);

    // Сократили период — дни за его пределами уходят
    await saveWarmupDay(ownerCtx, campaign.id, "2026-12-20", { meaning: "оффер" });
    await updateCampaign(ownerCtx, campaign.id, { ...base, endDate: "2026-12-15", salesStartDate: "2026-12-14" });
    expect((await getCampaign(ownerCtx, campaign.id)).days).toEqual([]);
  });

  it("публикация получает рубрику, смыслы и кампанию только своего проекта", async () => {
    const { ownerCtx, strangerCtx } = await setup();
    const own = await createCampaign(ownerCtx, { name: "Свой", startDate: "2026-12-01", endDate: "2026-12-10" });
    const foreign = await createCampaign(strangerCtx, { name: "Чужой", startDate: "2026-12-01", endDate: "2026-12-10" });
    const base = { title: "Кейс клиента", platform: "INSTAGRAM", type: "CASE", status: "IDEA", date: "2026-12-03" } as const;

    await expect(createPublication(ownerCtx, { ...base, campaignId: foreign.id })).rejects.toEqual(expectCode("NOT_FOUND"));
    const pub = await createPublication(ownerCtx, { ...base, campaignId: own.id, rubric: "CASE", meanings: ["EXPERTISE"] });
    expect(await getPublication(ownerCtx, pub.id)).toMatchObject({ campaignId: own.id, rubric: "CASE", meanings: ["EXPERTISE"] });
  });
});

describe("задачи", () => {
  beforeEach(resetDatabase);

  it("видимость: SMM не видит задачи по клиентам, менеджер — свои и по клиентам, чужой проект — ничего", async () => {
    const { ownerCtx, managerCtx, smmCtx, strangerCtx, smm, manager, stranger } = await setup();
    const client = await createClient(ownerCtx, { name: "Мария" });
    await createTask(ownerCtx, { title: "Позвонить Марии", clientId: client.id, assigneeId: manager.id, dueDate: "2026-11-09" });
    await createTask(ownerCtx, { title: "Снять ролик", assigneeId: smm.id, dueDate: "2026-11-10" });

    await expect(createTask(smmCtx, { title: "x", clientId: client.id })).rejects.toEqual(expectCode("FORBIDDEN"));
    await expect(createTask(ownerCtx, { title: "x", assigneeId: stranger.id })).rejects.toEqual(expectCode("NOT_FOUND"));
    await expect(createTask(strangerCtx, { title: "x", clientId: client.id })).rejects.toEqual(expectCode("NOT_FOUND"));

    expect((await listTasks(ownerCtx)).map((t) => t.title).sort()).toEqual(["Позвонить Марии", "Снять ролик"]);
    expect((await listTasks(smmCtx)).map((t) => t.title)).toEqual(["Снять ролик"]);
    expect((await listTasks(managerCtx)).map((t) => t.title)).toEqual(["Позвонить Марии"]);
    expect(await listTasks(strangerCtx)).toEqual([]);
    expect(await openTaskCounts(ownerCtx)).toEqual({ [manager.id]: 1, [smm.id]: 1 });

    // Задачу по клиенту не поручить SMM; менеджер не привязывает публикации; удаляет автор или владелец
    await expect(createTask(ownerCtx, { title: "x", clientId: client.id, assigneeId: smm.id })).rejects.toEqual(expectCode("VALIDATION"));
    const pub = await createPublication(ownerCtx, { title: "Пост", platform: "INSTAGRAM", type: "EXPERT", status: "IDEA", date: null });
    await expect(createTask(managerCtx, { title: "x", publicationId: pub.id })).rejects.toEqual(expectCode("FORBIDDEN"));
    const ownerTask = (await listTasks(ownerCtx)).find((t) => t.title === "Снять ролик")!;
    await expect(deleteTask(smmCtx, ownerTask.id)).rejects.toEqual(expectCode("FORBIDDEN"));
    await deleteTask(ownerCtx, ownerTask.id);
  });

  it("мои задачи на сегодня-завтра, просроченные, отметка «готово»", async () => {
    const { smmCtx, smm } = await setup();
    const late = await createTask(smmCtx, { title: "Просрочено", assigneeId: smm.id, dueDate: "2026-11-01" });
    await createTask(smmCtx, { title: "Завтра", assigneeId: smm.id, dueDate: "2026-11-10" });
    await createTask(smmCtx, { title: "Через неделю", assigneeId: smm.id, dueDate: "2026-11-16" });
    await createTask(smmCtx, { title: "Без срока", assigneeId: smm.id });

    expect((await myUpcomingTasks(smmCtx, "2026-11-09")).map((t) => t.title)).toEqual(["Просрочено", "Завтра"]);
    const buckets = bucketTasks(await listTasks(smmCtx), "2026-11-09");
    expect(Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.map((t) => t.title)]))).toEqual({
      overdue: ["Просрочено"],
      today: [],
      tomorrow: ["Завтра"],
      later: ["Через неделю"],
      noDate: ["Без срока"],
    });

    await setTaskStatus(smmCtx, late.id, "DONE");
    expect(await prisma.task.findUniqueOrThrow({ where: { id: late.id } })).toMatchObject({ status: "DONE", doneAt: expect.any(Date) });
    expect((await listTasks(smmCtx)).map((t) => t.title)).not.toContain("Просрочено");
  });
});
