import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getProjectContext } from "@/lib/db/access";
import { AppError } from "@/lib/db/errors";
import {
  createPublication,
  getPublication,
  listPlan,
  monthSummary,
  movePublication,
  planFromScript,
  publishedRows,
  repeatPublication,
  updatePublication,
  type PublicationInput,
} from "@/lib/db/publications";
import { addDays, monthEnd, todayDay, weekStart, weekdayIndex } from "@/lib/content/dates";
import { bestWeekday, changePct, computeTiles, engagementRate, resolvePeriod, toCsv, topAndBottom, type StatRow } from "@/lib/content/stats";
import { createUser, createWorkspace, resetDatabase } from "./helpers";

const expectCode = (code: AppError["code"]) => expect.objectContaining({ name: "AppError", code });

const base: PublicationInput = { title: "Ролик", platform: "INSTAGRAM", type: "EXPERT", status: "IDEA", date: null };

async function setup() {
  const alice = await createUser("alice@test.ru");
  const bob = await createUser("bob@test.ru");
  const manager = await createUser("manager@test.ru");
  const wsA = await createWorkspace(alice, ["Проект Алисы"], [{ userId: manager.id, role: "MANAGER" }]);
  const wsB = await createWorkspace(bob, ["Проект Боба"]);
  const ctxA = await getProjectContext(alice.id, wsA.projects[0].id);
  const ctxB = await getProjectContext(bob.id, wsB.projects[0].id);
  const managerCtx = await getProjectContext(manager.id, wsA.projects[0].id);
  return { ctxA, ctxB, managerCtx };
}

function row(day: string, views: number | null, extra: Partial<StatRow> = {}): StatRow {
  return {
    id: day,
    title: `Пост ${day}`,
    day,
    platform: "INSTAGRAM",
    type: "EXPERT",
    isStar: false,
    permalink: null,
    views,
    reach: null,
    likes: null,
    comments: null,
    saves: null,
    shares: null,
    avgWatchSec: null,
    profileVisits: null,
    linkClicks: null,
    follows: null,
    coldAudiencePct: null,
    ...extra,
  };
}

describe("дни плана", () => {
  it("сегодня считается по Алматы, неделя начинается с понедельника", () => {
    expect(todayDay(new Date("2026-11-08T20:30:00Z"))).toBe("2026-11-09"); // 01:30 по Алматы
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // воскресенье → понедельник
    expect(weekdayIndex("2026-11-09")).toBe(0);
    expect(monthEnd("2026-02-10")).toBe("2026-02-28");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("статистика: расчёты", () => {
  it("плитки, медиана и вовлечённость", () => {
    const rows = [row("2026-11-02", 1000, { reach: 500, likes: 40, comments: 10 }), row("2026-11-03", 3000), row("2026-11-04", null)];
    const tiles = computeTiles(rows);
    expect(tiles).toMatchObject({ publications: 3, views: 4000, avgViews: 2000, medianViews: 2000, reach: 500 });
    expect(tiles.er).toBeCloseTo(10);
    expect(engagementRate(rows[1])).toBeNull();
    expect(tiles.follows).toBeNull();
  });

  it("сравнение с прошлым периодом и сами периоды", () => {
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(5, 0)).toBeNull();
    expect(resolvePeriod("30d", "2026-11-30")).toEqual({
      key: "30d",
      current: { from: "2026-11-01", to: "2026-11-30" },
      previous: { from: "2026-10-02", to: "2026-10-31" },
    });
    expect(resolvePeriod("prev-month", "2026-03-15").current).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolvePeriod("month", "2026-03-31").previous).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolvePeriod("custom", "2026-11-30", { from: "2026-11-10", to: "2026-11-01" }).key).toBe("30d");
    expect(resolvePeriod("all", "2026-11-30").current).toBeNull();
  });

  it("лучший день недели, топ и слабые без пересечений", () => {
    const rows = [row("2026-11-02", 100), row("2026-11-09", 300), row("2026-11-04", 1000), row("2026-11-05", 50)];
    expect(bestWeekday(rows)).toEqual({ weekday: 2, avgViews: 1000, count: 1 });
    const { top, bottom } = topAndBottom(rows, 2);
    expect(top.map((r) => r.views)).toEqual([1000, 300]);
    expect(bottom.map((r) => r.views)).toEqual([50, 100]);
    expect(topAndBottom(rows.slice(0, 3), 5).bottom).toEqual([]);
  });

  it("CSV для Excel: точка с запятой, кавычки и защита от формул", () => {
    const csv = toCsv([row("2026-11-02", 10, { title: '=СУММ("x";1)' })]);
    expect(csv.startsWith("﻿Дата;Название")).toBe(true);
    expect(csv).toContain(`"'=СУММ(""x"";1)"`);
  });
});

describe("контент-план", () => {
  beforeEach(resetDatabase);

  it("проект видит только свои публикации", async () => {
    const { ctxA, ctxB } = await setup();
    const own = await createPublication(ctxA, { ...base, date: "2026-11-10" });
    await createPublication(ctxB, { ...base, title: "Чужой", date: "2026-11-10" });

    const plan = await listPlan(ctxA, "2026-11-09", "2026-11-15");
    expect(plan.dated.map((p) => p.title)).toEqual(["Ролик"]);
    await expect(getPublication(ctxB, own.id)).rejects.toEqual(expectCode("NOT_FOUND"));
    await expect(movePublication(ctxB, own.id, { date: "2026-11-11" })).rejects.toEqual(expectCode("NOT_FOUND"));
  });

  it("менеджер не правит контент-план, неверные данные отклоняются", async () => {
    const { ctxA, managerCtx } = await setup();
    await expect(createPublication(managerCtx, base)).rejects.toEqual(expectCode("FORBIDDEN"));
    await expect(createPublication(ctxA, { ...base, title: "  " })).rejects.toEqual(expectCode("VALIDATION"));
    await expect(createPublication(ctxA, { ...base, date: "10.11.2026" })).rejects.toEqual(expectCode("VALIDATION"));
    await expect(createPublication(ctxA, { ...base, referenceUrl: "https://instagram.com/reel/NOPE/" })).rejects.toEqual(
      expectCode("VALIDATION"),
    );
  });

  it("перенос, повтор через неделю и сводка месяца", async () => {
    const { ctxA } = await setup();
    const pub = await createPublication(ctxA, { ...base, date: "2026-11-10", status: "PUBLISHED", views: 500, codeWord: "СТАРТ" });
    await movePublication(ctxA, pub.id, { date: "2026-11-12", platform: "TELEGRAM" });
    const moved = await getPublication(ctxA, pub.id);
    expect(moved).toMatchObject({ platform: "TELEGRAM", date: new Date("2026-11-12T00:00:00Z") });

    const copy = await repeatPublication(ctxA, pub.id, "2026-11-09");
    const repeated = await getPublication(ctxA, copy.id);
    expect(repeated).toMatchObject({ status: "IDEA", views: null, codeWord: "СТАРТ", date: new Date("2026-11-19T00:00:00Z") });

    expect(await monthSummary(ctxA, "2026-11-01")).toEqual({ planned: 2, published: 1 });
  });

  it("статистику из Instagram руками не перезаписать, ручные поля сохраняются", async () => {
    const { ctxA } = await setup();
    const pub = await createPublication(ctxA, { ...base, date: "2026-11-10", status: "PUBLISHED" });
    await prisma.publication.update({ where: { id: pub.id }, data: { igMediaId: "ig-1", views: 7000 } });

    await updatePublication(ctxA, pub.id, { ...base, date: "2026-11-10", status: "PUBLISHED", views: 1, follows: 12, coldAudiencePct: 40 });
    const rows = await publishedRows(ctxA, { from: "2026-11-01", to: "2026-11-30" });
    expect(rows).toEqual([expect.objectContaining({ day: "2026-11-10", views: 7000, follows: 12, coldAudiencePct: 40 })]);
  });

  it("сценарий ставится в план один раз, с текстом и кадрами", async () => {
    const { ctxA, ctxB } = await setup();
    const script = await prisma.script.create({
      data: {
        workspaceId: ctxA.workspaceId,
        projectId: ctxA.projectId,
        title: "Как начать блог",
        hook: "Я год боялся снимать",
        shots: [{ text: "Первый ролик", shoot: "Я у окна" }],
        ending: "Пиши «СТАРТ»",
        caption: "Текст к выкладке",
        status: "SHOOT",
      },
    });
    await expect(planFromScript(ctxB, script.id, null)).rejects.toEqual(expectCode("NOT_FOUND"));

    const pub = await planFromScript(ctxA, script.id, "2026-11-11");
    const saved = await getPublication(ctxA, pub.id);
    expect(saved).toMatchObject({ title: "Как начать блог", text: "Текст к выкладке", status: "SHOOT" });
    expect(saved.note).toContain("Кадр 1: Первый ролик\n  Что снимать: Я у окна");
    await expect(planFromScript(ctxA, script.id, null)).rejects.toEqual(expectCode("CONFLICT"));
  });
});
