// Доска прогрева: стикеры и картинки на свободном полотне. Все запросы ограничены projectId из контекста.
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { AppError, notFoundError } from "@/lib/db/errors";
import { assertCan, type ProjectContext } from "@/lib/db/access";
import { parseInput } from "@/lib/validation";

export const BOARD_SIZE = { width: 2400, height: 1600 };
export const BOARD_COLORS = ["amber", "sky", "emerald", "rose", "violet", "slate"] as const;
const MAX_ITEMS = 300;

const geometry = {
  x: z.number().int().min(0).max(BOARD_SIZE.width),
  y: z.number().int().min(0).max(BOARD_SIZE.height),
  width: z.number().int().min(80).max(800),
  height: z.number().int().min(60).max(800),
};

const itemInput = z.object({
  kind: z.enum(["STICKY", "IMAGE"]),
  ...geometry,
  text: z.string().max(1000, "Стикер — до 1000 символов").default(""),
  color: z.enum(BOARD_COLORS).default("amber"),
  imageUrl: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .default(null)
    .refine((v) => v === null || /^https:\/\/\S+$/i.test(v), "Ссылка на картинку должна начинаться с https://"),
});

const itemPatch = z.object({
  x: geometry.x.optional(),
  y: geometry.y.optional(),
  width: geometry.width.optional(),
  height: geometry.height.optional(),
  text: z.string().max(1000, "Стикер — до 1000 символов").optional(),
  color: z.enum(BOARD_COLORS).optional(),
});

export type BoardItemInput = z.input<typeof itemInput>;
export type BoardItemPatch = z.input<typeof itemPatch>;

async function ownCampaign(ctx: ProjectContext, campaignId: string) {
  const campaign = await prisma.warmupCampaign.findFirst({ where: { id: campaignId, projectId: ctx.projectId }, select: { id: true } });
  if (!campaign) throw notFoundError();
  return campaign;
}

export async function listBoardItems(ctx: ProjectContext, campaignId: string) {
  const campaign = await ownCampaign(ctx, campaignId);
  return prisma.boardItem.findMany({ where: { campaignId: campaign.id }, orderBy: { createdAt: "asc" } });
}

export async function createBoardItem(ctx: ProjectContext, campaignId: string, raw: BoardItemInput) {
  assertCan(ctx, "content.manage");
  const input = parseInput(itemInput, raw);
  if (input.kind === "IMAGE" && !input.imageUrl) throw new AppError("VALIDATION", "Вставьте ссылку на картинку");
  const campaign = await ownCampaign(ctx, campaignId);
  const count = await prisma.boardItem.count({ where: { campaignId: campaign.id } });
  if (count >= MAX_ITEMS) throw new AppError("LIMIT", `На доске уже ${MAX_ITEMS} элементов — удалите лишние.`);
  return prisma.boardItem.create({
    data: { ...input, campaignId: campaign.id, workspaceId: ctx.workspaceId, projectId: ctx.projectId },
  });
}

export async function updateBoardItem(ctx: ProjectContext, id: string, raw: BoardItemPatch) {
  assertCan(ctx, "content.manage");
  const patch = parseInput(itemPatch, raw);
  const item = await prisma.boardItem.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!item) throw notFoundError();
  await prisma.boardItem.update({ where: { id: item.id }, data: patch });
}

export async function deleteBoardItem(ctx: ProjectContext, id: string) {
  assertCan(ctx, "content.manage");
  const item = await prisma.boardItem.findFirst({ where: { id, projectId: ctx.projectId }, select: { id: true } });
  if (!item) throw notFoundError();
  await prisma.boardItem.delete({ where: { id: item.id } });
}
