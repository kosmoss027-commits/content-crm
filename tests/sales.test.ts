import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getProjectContext } from "@/lib/db/access";
import { AppError } from "@/lib/db/errors";
import { createPublication } from "@/lib/db/publications";
import {
  addPayment,
  convertLead,
  createKeyword,
  createLead,
  deleteLead,
  getClient,
  keywordReport,
  listClients,
  listLeads,
  moneySummary,
} from "@/lib/db/sales";
import { findKeywords, normalizeHandle, normalizeWord } from "@/lib/crm/keywords";
import { recordComments } from "@/lib/crm/comments";
import { dayStartInZone } from "@/lib/content/dates";
import { createUser, createWorkspace, resetDatabase } from "./helpers";

const expectCode = (code: AppError["code"]) => expect.objectContaining({ name: "AppError", code });

async function setup() {
  const alice = await createUser("alice@test.ru");
  const manager = await createUser("manager@test.ru");
  const smm = await createUser("smm@test.ru");
  const bob = await createUser("bob@test.ru");
  const wsA = await createWorkspace(alice, ["Блог"], [
    { userId: manager.id, role: "MANAGER" },
    { userId: smm.id, role: "SMM" },
  ]);
  const wsB = await createWorkspace(bob, ["Чужой"]);
  return {
    ctxA: await getProjectContext(alice.id, wsA.projects[0].id),
    managerCtx: await getProjectContext(manager.id, wsA.projects[0].id),
    smmCtx: await getProjectContext(smm.id, wsA.projects[0].id),
    ctxB: await getProjectContext(bob.id, wsB.projects[0].id),
  };
}

describe("кодовые слова: поиск в тексте", () => {
  it("нормализует и находит слово целиком, без учёта регистра и ё", () => {
    expect(normalizeWord(" #путь ")).toBe("ПУТЬ");
    expect(normalizeWord("два слова")).toBeNull();
    expect(normalizeHandle("@Amin.Blog ")).toBe("amin.blog");
    expect(findKeywords("Хочу! путь 🔥", ["ПУТЬ", "ХОЧУ", "ПЛАН"])).toEqual(["ПУТЬ", "ХОЧУ"]);
    expect(findKeywords("распутье", ["ПУТЬ"])).toEqual([]);
    expect(findKeywords("всё ясно, ещё", ["ЕЩЕ"])).toEqual(["ЕЩЕ"]);
  });
});

describe("заявки, клиенты, оплаты", () => {
  beforeEach(resetDatabase);

  it("SMM не видит продажи, чужой проект недоступен, слово не дублируется", async () => {
    const { ctxA, smmCtx, ctxB, managerCtx } = await setup();
    await expect(createKeyword(smmCtx, { word: "путь" })).rejects.toEqual(expectCode("FORBIDDEN"));
    const keyword = await createKeyword(managerCtx, { word: "путь", product: "Наставничество" });
    expect(keyword.word).toBe("ПУТЬ");
    await expect(createKeyword(ctxA, { word: "ПУТЬ" })).rejects.toEqual(expectCode("CONFLICT"));
    await expect(createLead(ctxB, { handle: "x", source: "DIRECT", keywordId: keyword.id })).rejects.toEqual(expectCode("NOT_FOUND"));
    await expect(createLead(ctxA, { handle: "@Ivan", source: "DIRECT", keywordId: keyword.id })).resolves.toBeTruthy();
    await expect(createLead(ctxA, { handle: "ivan", source: "DIRECT", keywordId: keyword.id })).rejects.toEqual(expectCode("CONFLICT"));
    expect(await listLeads(ctxB)).toEqual([]);
  });

  it("заявка → клиент → оплаты; карточка клиента с историей", async () => {
    const { ctxA, ctxB } = await setup();
    const keyword = await createKeyword(ctxA, { word: "ПЛАН" });
    const lead = await createLead(ctxA, { handle: "Мария", source: "TELEGRAM", contact: "+7 900 123-45-67", keywordId: keyword.id, date: "2026-11-02" });
    const client = await convertLead(ctxA, lead.id);
    expect(await convertLead(ctxA, lead.id)).toEqual({ id: client.id });

    await addPayment(ctxA, client.id, { amountRub: 15000, product: "Наставничество", paidAt: "2026-11-05" });
    await addPayment(ctxA, client.id, { amountRub: 5000, paidAt: "2026-11-20" });
    await expect(addPayment(ctxB, client.id, { amountRub: 1, paidAt: "2026-11-05" })).rejects.toEqual(expectCode("NOT_FOUND"));
    await expect(addPayment(ctxA, client.id, { amountRub: 0, paidAt: "2026-11-05" })).rejects.toEqual(expectCode("VALIDATION"));

    const card = await getClient(ctxA, client.id);
    expect(card).toMatchObject({ name: "Мария", telegram: "Мария", phone: "+7 900 123-45-67", source: "TELEGRAM", keyword: { word: "ПЛАН" } });
    expect(card.leads.map((l) => l.status)).toEqual(["CLIENT"]);
    expect((await listClients(ctxA))[0]).toMatchObject({ paymentsCount: 2, revenueRub: 20000 });
    expect(await moneySummary(ctxA, { from: "2026-11-01", to: "2026-11-10" })).toEqual({ leads: 1, payments: 1, revenueRub: 15000 });
  });

  it("комментарии с кодовым словом: упоминания, заявка по первому касанию, без дублей", async () => {
    const { ctxA } = await setup();
    await createKeyword(ctxA, { word: "ПУТЬ" });
    const early = await createPublication(ctxA, { title: "Первый", platform: "INSTAGRAM", type: "EXPERT", status: "PUBLISHED", date: "2026-11-01", codeWord: "путь", views: 2000 });
    const late = await createPublication(ctxA, { title: "Второй", platform: "INSTAGRAM", type: "EXPERT", status: "PUBLISHED", date: "2026-11-05", codeWord: "ПУТЬ", views: 3000 });
    await prisma.publication.update({ where: { id: early.id }, data: { igMediaId: "m-early" } });
    await prisma.publication.update({ where: { id: late.id }, data: { igMediaId: "m-late" } });
    const project = { projectId: ctxA.projectId, workspaceId: ctxA.workspaceId };

    const comments = [
      { igCommentId: "c2", igMediaId: "m-late", username: "Ivan", text: "путь!", at: new Date("2026-11-06T10:00:00Z") },
      { igCommentId: "c3", igMediaId: "m-late", username: "olga", text: "классно", at: new Date("2026-11-06T11:00:00Z") },
    ];
    expect(await recordComments(project, comments)).toEqual({ mentions: 1, newLeads: 1 });
    // Позже нашли более ранний комментарий того же человека под первым постом — источник переносится
    const again = [...comments, { igCommentId: "c1", igMediaId: "m-early", username: "@ivan", text: "Путь", at: new Date("2026-11-02T09:00:00Z") }];
    expect(await recordComments(project, again)).toEqual({ mentions: 1, newLeads: 0 });

    const leads = await listLeads(ctxA);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ handle: "ivan", source: "COMMENT", publication: { title: "Первый" } });

    const [row] = await keywordReport(ctxA, { from: "2026-11-01", to: "2026-11-30" });
    // Иван написал слово дважды — это один человек
    expect(row).toMatchObject({ word: "ПУТЬ", posts: 2, views: 5000, wrote: 1, leads: 1, payments: 0, revenueRub: 0 });
    expect(row.per1000).toBeCloseTo(0.2);
  });

  it("два слова в одном комментарии, удалённая заявка не возвращается, двойной «Стал клиентом» — один клиент", async () => {
    const { ctxA } = await setup();
    await createKeyword(ctxA, { word: "ПУТЬ" });
    await createKeyword(ctxA, { word: "ГИД" });
    const project = { projectId: ctxA.projectId, workspaceId: ctxA.workspaceId };
    const comment = { igCommentId: "c1", igMediaId: "m1", username: "olga", text: "путь и гид", at: new Date("2026-11-06T10:00:00Z") };

    expect(await recordComments(project, [comment])).toEqual({ mentions: 2, newLeads: 2 });
    const leads = await listLeads(ctxA);
    await deleteLead(ctxA, leads[0].id);
    expect(await recordComments(project, [comment])).toEqual({ mentions: 0, newLeads: 0 });
    expect(await listLeads(ctxA)).toHaveLength(1);

    const [a, b] = await Promise.all([convertLead(ctxA, leads[1].id), convertLead(ctxA, leads[1].id)]);
    expect(a.id).toBe(b.id);
    expect(await listClients(ctxA)).toHaveLength(1);
  });

  it("день периода считается по Алматы", () => {
    expect(dayStartInZone("2026-11-10").toISOString()).toBe("2026-11-09T19:00:00.000Z");
  });
});
