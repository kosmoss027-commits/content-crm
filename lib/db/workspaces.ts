import { getPlan, type PlanLimits } from "@/config/plans";
import { prisma } from "@/lib/db/prisma";
import { assertCan, type WorkspaceContext } from "@/lib/db/access";
import { parseInput, workspaceInput } from "@/lib/validation";

export async function renameWorkspace(ctx: WorkspaceContext, input: unknown) {
  assertCan(ctx, "settings.view");
  const { name } = parseInput(workspaceInput, input);
  await prisma.workspace.update({ where: { id: ctx.workspaceId }, data: { name } });
}

export type UsageRow = { label: string; used: number; limit: number | null; note?: string };

/** Использование лимитов тарифа. Счётчики разведки и разборов заработают на этапах 2–3. */
export async function getWorkspaceUsage(ctx: WorkspaceContext): Promise<{ plan: PlanLimits; rows: UsageRow[] }> {
  assertCan(ctx, "settings.view");
  const plan = getPlan(ctx.workspace.plan);
  const [projects, members] = await Promise.all([
    prisma.project.count({ where: { workspaceId: ctx.workspaceId, archivedAt: null } }),
    prisma.membership.count({ where: { workspaceId: ctx.workspaceId } }),
  ]);

  return {
    plan,
    rows: [
      { label: "Проекты", used: projects, limit: plan.projects },
      { label: "Участники", used: members, limit: plan.members },
      { label: "Аккаунтов в разведке (на проект)", used: 0, limit: plan.watchedAccounts, note: "этап 2" },
      { label: "Разборов роликов в месяц", used: 0, limit: plan.analysesPerMonth, note: "этап 3" },
    ],
  };
}
