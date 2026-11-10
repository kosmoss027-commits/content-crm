import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getProjectContext } from "@/lib/db/access";
import { AppError } from "@/lib/db/errors";
import { createBoardItem, deleteBoardItem, listBoardItems, updateBoardItem } from "@/lib/db/board";
import { addExpense, pnlReport } from "@/lib/db/finance";
import { connectionChains } from "@/lib/db/graph";
import { createPublication } from "@/lib/db/publications";
import { addPayment, convertLead, createKeyword, createLead, createMagnet, magnetFunnel } from "@/lib/db/sales";
import { createCampaign } from "@/lib/db/warmups";
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
    ownerCtx: await getProjectContext(owner.id, projectId),
    managerCtx: await getProjectContext(manager.id, projectId),
    smmCtx: await getProjectContext(smm.id, projectId),
    strangerCtx: await getProjectContext(stranger.id, other.projects[0].id),
  };
}

beforeEach(resetDatabase);

describe("доска прогрева", () => {
  it("стикеры: права, проверка ссылки и размеров, чужой проект не видит", async () => {
    const { ownerCtx, managerCtx, smmCtx, strangerCtx } = await setup();
    const campaign = await createCampaign(ownerCtx, { name: "Прогрев", startDate: "2026-12-01", endDate: "2026-12-20" });
    const sticky = await createBoardItem(smmCtx, campaign.id, { kind: "STICKY", x: 10, y: 20, width: 200, height: 140, text: "идея" });
    await expect(createBoardItem(managerCtx, campaign.id, { kind: "STICKY", x: 0, y: 0, width: 200, height: 140 })).rejects.toEqual(expectCode("FORBIDDEN"));
    await expect(createBoardItem(ownerCtx, campaign.id, { kind: "IMAGE", x: 0, y: 0, width: 200, height: 140, imageUrl: "javascript:alert(1)" })).rejects.toEqual(
      expectCode("VALIDATION"),
    );
    await expect(createBoardItem(ownerCtx, campaign.id, { kind: "IMAGE", x: 0, y: 0, width: 200, height: 140 })).rejects.toEqual(expectCode("VALIDATION"));
    await expect(updateBoardItem(ownerCtx, sticky.id, { width: 5000 })).rejects.toEqual(expectCode("VALIDATION"));
    await expect(listBoardItems(strangerCtx, campaign.id)).rejects.toEqual(expectCode("NOT_FOUND"));
    await expect(deleteBoardItem(strangerCtx, sticky.id)).rejects.toEqual(expectCode("NOT_FOUND"));

    await updateBoardItem(ownerCtx, sticky.id, { x: 300, y: 400, text: "новая идея", color: "sky" });
    expect(await listBoardItems(ownerCtx, campaign.id)).toEqual([expect.objectContaining({ x: 300, y: 400, text: "новая идея", color: "sky" })]);
  });
});

describe("P&L", () => {
  it("только владелец; выручка из оплат, расходы по категориям, прибыль по месяцам", async () => {
    const { ownerCtx, managerCtx, strangerCtx } = await setup();
    await expect(addExpense(managerCtx, { amountRub: 100, category: "Реклама", spentAt: "2026-11-05" })).rejects.toEqual(expectCode("FORBIDDEN"));
    await addExpense(ownerCtx, { amountRub: 3000, category: "Реклама", spentAt: "2026-11-05" });
    await addExpense(ownerCtx, { amountRub: 2000, category: "Монтаж и съёмка", spentAt: "2026-10-20" });
    await addExpense(strangerCtx, { amountRub: 999999, category: "Реклама", spentAt: "2026-11-05" });
    const lead = await createLead(ownerCtx, { handle: "ivan", source: "DIRECT" });
    const client = await convertLead(ownerCtx, lead.id);
    await addPayment(ownerCtx, client.id, { amountRub: 15000, paidAt: "2026-11-07" });

    const report = await pnlReport(ownerCtx, "2026-11-10", 1);
    expect(report).toEqual([
      { month: "2026-10-01", revenueRub: 0, expensesRub: 2000, profitRub: -2000, byCategory: { "Монтаж и съёмка": 2000 } },
      { month: "2026-11-01", revenueRub: 15000, expensesRub: 3000, profitRub: 12000, byCategory: { Реклама: 3000 } },
    ]);
  });
});

describe("ЛМ-воронка и связи", () => {
  it("лид-магнит по слову: получили → клиенты → купили; одно слово — один магнит", async () => {
    const { ownerCtx, strangerCtx } = await setup();
    const keyword = await createKeyword(ownerCtx, { word: "ГАЙД" });
    await createMagnet(ownerCtx, { name: "Гайд по блогу", keywordId: keyword.id, url: "https://example.com/guide" });
    await expect(createMagnet(ownerCtx, { name: "Второй", keywordId: keyword.id })).rejects.toEqual(expectCode("CONFLICT"));
    await expect(createMagnet(strangerCtx, { name: "Чужой", keywordId: keyword.id })).rejects.toEqual(expectCode("NOT_FOUND"));
    await expect(createMagnet(ownerCtx, { name: "Плохая ссылка", url: "ftp://x" })).rejects.toEqual(expectCode("VALIDATION"));

    const a = await createLead(ownerCtx, { handle: "anna", source: "DIRECT", keywordId: keyword.id });
    await createLead(ownerCtx, { handle: "boris", source: "DIRECT", keywordId: keyword.id });
    const client = await convertLead(ownerCtx, a.id);
    await addPayment(ownerCtx, client.id, { amountRub: 5000, paidAt: "2026-11-08" });

    const [row] = await magnetFunnel(ownerCtx, null);
    expect(row).toMatchObject({ name: "Гайд по блогу", got: 2, clients: 1, buyers: 1, revenueRub: 5000 });
    expect(row.conversionPct).toBe(50);
    expect(await magnetFunnel(strangerCtx, null)).toEqual([]);
  });

  it("цепочка: референс → публикация → заявка → деньги, только свой проект", async () => {
    const { ownerCtx, strangerCtx } = await setup();
    const account = await prisma.scrapedAccount.create({ data: { username: "expert" } });
    await prisma.watchlistEntry.create({ data: { workspaceId: ownerCtx.workspaceId, projectId: ownerCtx.projectId, accountId: account.id, status: "WATCHING" } });
    await prisma.scrapedReel.create({ data: { shortCode: "REF1", accountId: account.id, url: "https://www.instagram.com/reel/REF1/", postedAt: new Date(), views: 9000, multiplier: 6 } });
    const pub = await createPublication(ownerCtx, {
      title: "Мой ролик по мотивам",
      platform: "INSTAGRAM",
      type: "EXPERT",
      status: "PUBLISHED",
      date: "2026-11-05",
      codeWord: "путь",
      referenceUrl: "https://www.instagram.com/reel/REF1/",
    });
    const lead = await createLead(ownerCtx, { handle: "olga", source: "DIRECT", publicationId: pub.id });
    const client = await convertLead(ownerCtx, lead.id);
    await addPayment(ownerCtx, client.id, { amountRub: 20000, paidAt: "2026-11-09" });

    const chains = await connectionChains(ownerCtx);
    expect(chains).toEqual([
      expect.objectContaining({
        reel: expect.objectContaining({ label: "@expert" }),
        script: null,
        publication: expect.objectContaining({ label: "Мой ролик по мотивам" }),
        money: { leads: 1, buyers: 1, revenueRub: 20000, keyword: "путь" },
      }),
    ]);
    expect(await connectionChains(strangerCtx)).toEqual([]);
  });
});
