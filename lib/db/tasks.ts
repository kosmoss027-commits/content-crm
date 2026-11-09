// Задачи проекта. Видимость: владелец — все; менеджер — свои и по клиентам; ассистент и SMM — кроме задач по клиентам.
import { z } from "zod";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { AppError, notFoundError } from "@/lib/db/errors";
import { type ProjectContext } from "@/lib/db/access";
import { parseInput } from "@/lib/validation";
import { addDays, dayToDate, isDay } from "@/lib/content/dates";

const optionalId = z
  .string()
  .nullable()
  .default(null)
  .transform((v) => (v ? v : null));

export function visibleTasksWhere(ctx: ProjectContext): Prisma.TaskWhereInput {
  const base = { projectId: ctx.projectId };
  if (ctx.role === "OWNER") return base;
  if (ctx.role === "MANAGER") return { ...base, OR: [{ assigneeId: ctx.userId }, { createdById: ctx.userId }, { clientId: { not: null } }] };
  return { ...base, clientId: null };
}

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true } },
  publication: { select: { id: true, title: true } },
  client: { select: { id: true, name: true } },
  reel: { select: { id: true, url: true, account: { select: { username: true } } } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export async function listTasks(ctx: ProjectContext, filters: { mine?: boolean; includeDone?: boolean } = {}) {
  return prisma.task.findMany({
    where: {
      ...visibleTasksWhere(ctx),
      ...(filters.mine ? { assigneeId: ctx.userId } : {}),
      ...(filters.includeDone ? {} : { status: { not: "DONE" } }),
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 500,
    include: taskInclude,
  });
}

/** Мои задачи для «Сегодня» и «Сводки»: просроченные, на сегодня и на завтра. */
export async function myUpcomingTasks(ctx: ProjectContext, today: string) {
  return prisma.task.findMany({
    where: { ...visibleTasksWhere(ctx), assigneeId: ctx.userId, status: { not: "DONE" }, dueDate: { lte: dayToDate(addDays(today, 1)) } },
    orderBy: { dueDate: "asc" },
    take: 50,
    include: taskInclude,
  });
}

/** Открытые задачи по исполнителям — для страницы «Команда». */
export async function openTaskCounts(ctx: ProjectContext): Promise<Record<string, number>> {
  const rows = await prisma.task.groupBy({
    by: ["assigneeId"],
    where: { ...visibleTasksWhere(ctx), status: { not: "DONE" }, assigneeId: { not: null } },
    _count: true,
  });
  return Object.fromEntries(rows.map((r) => [r.assigneeId!, r._count]));
}

const taskInput = z.object({
  title: z.string().trim().min(1, "Введите задачу").max(200, "Задача — до 200 символов"),
  note: z.string().max(5000, "Заметка — до 5000 символов").default(""),
  dueDate: z
    .string()
    .nullable()
    .default(null)
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isDay(v), "Дата в формате ГГГГ-ММ-ДД"),
  assigneeId: optionalId,
  publicationId: optionalId,
  clientId: optionalId,
  reelId: optionalId,
});

export type TaskInput = z.input<typeof taskInput>;

/** Привязки проверяются: исполнитель — участник пространства, публикация/клиент/ролик — этого проекта. */
async function checkLinks(ctx: ProjectContext, input: z.output<typeof taskInput>) {
  const [assignee, publication, client, reel] = await Promise.all([
    input.assigneeId ? prisma.membership.findFirst({ where: { workspaceId: ctx.workspaceId, userId: input.assigneeId }, select: { id: true } }) : true,
    input.publicationId ? prisma.publication.findFirst({ where: { id: input.publicationId, projectId: ctx.projectId }, select: { id: true } }) : true,
    input.clientId ? prisma.client.findFirst({ where: { id: input.clientId, projectId: ctx.projectId }, select: { id: true } }) : true,
    input.reelId
      ? prisma.scrapedReel.findFirst({
          where: { id: input.reelId, account: { watches: { some: { projectId: ctx.projectId, status: { not: "CANDIDATE" } } } } },
          select: { id: true },
        })
      : true,
  ]);
  if (!assignee || !publication || !client || !reel) throw notFoundError();
  if (input.clientId && !can(ctx.role, "sales.manage")) throw new AppError("FORBIDDEN", "Задачи по клиентам ставят владелец и менеджер.");
}

export async function createTask(ctx: ProjectContext, raw: TaskInput) {
  const input = parseInput(taskInput, raw);
  await checkLinks(ctx, input);
  return prisma.task.create({
    data: { ...input, dueDate: input.dueDate ? dayToDate(input.dueDate) : null, workspaceId: ctx.workspaceId, projectId: ctx.projectId, createdById: ctx.userId },
    select: { id: true },
  });
}

async function findVisible(ctx: ProjectContext, id: string) {
  const task = await prisma.task.findFirst({ where: { ...visibleTasksWhere(ctx), id }, select: { id: true, status: true } });
  if (!task) throw notFoundError();
  return task;
}

export async function updateTask(ctx: ProjectContext, id: string, raw: TaskInput) {
  const input = parseInput(taskInput, raw);
  const task = await findVisible(ctx, id);
  await checkLinks(ctx, input);
  await prisma.task.update({ where: { id: task.id }, data: { ...input, dueDate: input.dueDate ? dayToDate(input.dueDate) : null } });
}

export async function setTaskStatus(ctx: ProjectContext, id: string, status: string, now = new Date()) {
  const next = parseInput(z.enum(["TODO", "IN_PROGRESS", "DONE"]), status);
  const task = await findVisible(ctx, id);
  await prisma.task.update({ where: { id: task.id }, data: { status: next, doneAt: next === "DONE" ? now : null } });
}

export async function deleteTask(ctx: ProjectContext, id: string) {
  const task = await findVisible(ctx, id);
  await prisma.task.delete({ where: { id: task.id } });
}

/** Корзины для экрана задач: просрочено, сегодня, завтра, позже, без срока. */
export function bucketTasks<T extends { dueDate: Date | null }>(tasks: T[], today: string) {
  const todayDate = dayToDate(today).getTime();
  const tomorrow = dayToDate(addDays(today, 1)).getTime();
  const buckets = { overdue: [] as T[], today: [] as T[], tomorrow: [] as T[], later: [] as T[], noDate: [] as T[] };
  for (const task of tasks) {
    const due = task.dueDate?.getTime();
    if (due === undefined) buckets.noDate.push(task);
    else if (due < todayDate) buckets.overdue.push(task);
    else if (due === todayDate) buckets.today.push(task);
    else if (due === tomorrow) buckets.tomorrow.push(task);
    else buckets.later.push(task);
  }
  return buckets;
}

// ─── Данные для экранов ───

type Option = { id: string; label: string };

/** Варианты для формы задачи: участники, публикации (если роли видна контент-часть), клиенты (если продажи). */
export async function taskFormOptions(ctx: ProjectContext): Promise<{ members: Option[]; publications: Option[]; clients: Option[] }> {
  const [members, publications, clients] = await Promise.all([
    prisma.membership.findMany({ where: { workspaceId: ctx.workspaceId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    can(ctx.role, "content.manage")
      ? prisma.publication.findMany({ where: { projectId: ctx.projectId }, orderBy: [{ date: { sort: "desc", nulls: "first" } }], take: 100, select: { id: true, title: true } })
      : [],
    can(ctx.role, "sales.manage") ? prisma.client.findMany({ where: { projectId: ctx.projectId }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } }) : [],
  ]);
  return {
    members: members.map((m) => ({ id: m.user.id, label: m.user.name || m.user.email })),
    publications: publications.map((p) => ({ id: p.id, label: p.title })),
    clients: clients.map((c) => ({ id: c.id, label: c.name })),
  };
}

const SHORT_MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Задача → строка списка (даты строками, ссылки на связанные объекты). */
export function toTaskItem(task: TaskRow, today: string, projectId: string) {
  const due = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null;
  const dueLabel = due ? (due === today ? "сегодня" : due === addDays(today, 1) ? "завтра" : `до ${Number(due.slice(8))} ${SHORT_MONTHS[Number(due.slice(5, 7)) - 1]}`) : null;
  const links = [
    task.publication && { label: `публикация «${task.publication.title}»`, href: `/p/${projectId}/content-plan` },
    task.client && { label: `клиент ${task.client.name}`, href: `/p/${projectId}/clients/${task.client.id}` },
    task.reel && { label: `ролик @${task.reel.account.username}`, href: task.reel.url },
  ].filter((l): l is { label: string; href: string } => Boolean(l));
  return {
    id: task.id,
    title: task.title,
    note: task.note,
    status: task.status,
    dueDate: due,
    assigneeId: task.assigneeId,
    publicationId: task.publicationId,
    clientId: task.clientId,
    reelId: task.reelId,
    dueLabel,
    overdue: due !== null && due < today,
    assigneeName: task.assignee ? task.assignee.name || task.assignee.email : null,
    links,
  };
}
