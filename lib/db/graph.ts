// Граф связей проекта: ролик-референс → сценарий → публикация → заявки и деньги. Только чтение, только свой проект.
import { prisma } from "@/lib/db/prisma";
import type { ProjectContext } from "@/lib/db/access";
import { dateToDay } from "@/lib/content/dates";

const GRAPH_LIMIT = 40;

export type GraphNode = { id: string; label: string; sub?: string; href?: string };
export type GraphChain = {
  reel: GraphNode | null;
  script: GraphNode | null;
  publication: GraphNode;
  money: { leads: number; buyers: number; revenueRub: number; keyword: string | null };
};

/**
 * Цепочки для последних публикаций, у которых есть хоть одна связь: референс, сценарий или заявки.
 * Деньги публикации — оплаты клиентов, чья заявка пришла с этой публикации (первое касание).
 */
export async function connectionChains(ctx: ProjectContext): Promise<GraphChain[]> {
  const publications = await prisma.publication.findMany({
    where: {
      projectId: ctx.projectId,
      OR: [{ referenceReelId: { not: null } }, { scriptId: { not: null } }, { leads: { some: {} } }],
    },
    orderBy: [{ date: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: GRAPH_LIMIT,
    select: {
      id: true,
      title: true,
      date: true,
      status: true,
      views: true,
      codeWord: true,
      referenceReel: { select: { id: true, url: true, multiplier: true, account: { select: { username: true } } } },
      script: {
        select: {
          id: true,
          title: true,
          analysis: { select: { reel: { select: { id: true, url: true, multiplier: true, account: { select: { username: true } } } } } },
        },
      },
      leads: { select: { id: true, clientId: true } },
    },
  });

  const clientIds = [...new Set(publications.flatMap((p) => p.leads.flatMap((l) => (l.clientId ? [l.clientId] : []))))];
  const payments = clientIds.length
    ? await prisma.payment.findMany({ where: { projectId: ctx.projectId, clientId: { in: clientIds } }, select: { clientId: true, amountRub: true } })
    : [];

  return publications.map((p) => {
    const reel = p.referenceReel ?? p.script?.analysis?.reel ?? null;
    const buyers = new Set(p.leads.flatMap((l) => (l.clientId ? [l.clientId] : [])));
    const revenueRub = payments.filter((pay) => buyers.has(pay.clientId)).reduce((sum, pay) => sum + pay.amountRub, 0);
    return {
      reel: reel
        ? {
            id: reel.id,
            label: `@${reel.account.username}`,
            sub: reel.multiplier ? `×${reel.multiplier.toFixed(1)} к медиане` : undefined,
            href: `/p/${ctx.projectId}/research/reel/${reel.id}`,
          }
        : null,
      script: p.script ? { id: p.script.id, label: p.script.title, href: `/p/${ctx.projectId}/scripts` } : null,
      publication: {
        id: p.id,
        label: p.title,
        sub: [p.date ? dateToDay(p.date).split("-").reverse().slice(0, 2).join(".") : "без даты", p.views !== null ? `${p.views} просм.` : null].filter(Boolean).join(" · "),
        href: `/p/${ctx.projectId}/content-plan?view=list`,
      },
      money: { leads: p.leads.length, buyers: buyers.size, revenueRub, keyword: p.codeWord },
    };
  });
}
