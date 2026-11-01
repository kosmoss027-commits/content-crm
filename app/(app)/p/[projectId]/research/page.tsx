import Link from "next/link";
import type { Market } from "@/lib/generated/prisma/enums";
import { can } from "@/lib/auth/permissions";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { prisma } from "@/lib/db/prisma";
import { hasRunningRuns, listRunsForProject, listViralFeed, type FeedFilters as Filters } from "@/lib/db/reels";
import { listProjectNiches, listWatchlist } from "@/lib/db/watchlist";
import { cn } from "@/lib/utils";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { AccountsTable, AddAccountsForm, CollectAllButton, type AccountRow } from "@/components/research/accounts-panel";
import { FeedFilters } from "@/components/research/feed-filters";
import { ReelGrid } from "@/components/research/reel-grid";
import { RunningWatcher } from "@/components/research/running-watcher";
import { RunsLog } from "@/components/research/runs-log";
import { HooksTab, HypothesesTab, WorksTab } from "@/components/factory/research-tabs";

export const metadata = { title: "Разведка — Content CRM" };

const TABS = [
  { id: "reels", title: "Ролики" },
  { id: "accounts", title: "Аккаунты" },
  { id: "log", title: "Журнал сбора" },
  { id: "hooks", title: "Хуки" },
  { id: "works", title: "Что работает" },
  { id: "hypotheses", title: "Гипотезы" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const positive = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export default async function ResearchPage({ params, searchParams }: PageProps<"/p/[projectId]/research">) {
  const { projectId } = await params;
  const query = await searchParams;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "research")) return <NoAccess />;

  const tab: TabId = TABS.some((t) => t.id === query.tab) ? (query.tab as TabId) : "reels";
  const canManage = can(ctx.role, "research.manage");
  const running = await hasRunningRuns();

  return (
    <>
      <PageHeader
        title="Разведка"
        description="Отслеживаемые аккаунты, залетевшие ролики и журнал сбора."
        actions={canManage ? <CollectAllButton projectId={projectId} /> : undefined}
      />
      {running && <RunningWatcher projectId={projectId} />}
      <nav className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b" aria-label="Вкладки разведки">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/p/${projectId}/research?tab=${t.id}`}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              tab === t.id && "border-foreground font-medium text-foreground",
            )}
          >
            {t.title}
          </Link>
        ))}
      </nav>

      {tab === "reels" && <ReelsTab projectId={projectId} query={query} canManage={canManage} />}
      {tab === "accounts" && <AccountsTab projectId={projectId} canManage={canManage} />}
      {tab === "log" && <RunsLog runs={await listRunsForProject(ctx)} />}
      {tab === "hooks" && <HooksTab ctx={ctx} query={query} canEdit={canManage} />}
      {tab === "works" && <WorksTab ctx={ctx} query={query} />}
      {tab === "hypotheses" && <HypothesesTab ctx={ctx} canEdit={canManage} />}
    </>
  );
}

async function ReelsTab({
  projectId,
  query,
  canManage,
}: {
  projectId: string;
  query: Record<string, string | string[] | undefined>;
  canManage: boolean;
}) {
  const ctx = await requireProjectContext(projectId);
  const filters: Filters = {
    market: query.market === "CIS" || query.market === "FOREIGN" ? (query.market as Market) : undefined,
    niche: typeof query.niche === "string" ? query.niche : undefined,
    periodDays: positive(query.period),
    minMultiplier: positive(query.min),
    maxDurationSec: positive(query.duration),
  };
  const [reels, niches, project] = await Promise.all([
    listViralFeed(ctx, filters),
    listProjectNiches(ctx),
    prisma.project.findUniqueOrThrow({ where: { id: ctx.projectId }, select: { viralThreshold: true, anomalyThreshold: true } }),
  ]);

  return (
    <>
      <FeedFilters niches={niches} />
      <p className="mb-3 text-xs text-muted-foreground">
        Залёт — от ×{project.viralThreshold} к медиане аккаунта, аномалия — от ×{project.anomalyThreshold}. Сортировка по множителю.
      </p>
      <ReelGrid
        projectId={projectId}
        reels={reels}
        anomalyThreshold={project.anomalyThreshold}
        canMark={canManage}
        empty="Залётов пока нет. Добавьте аккаунты во вкладке «Аккаунты» — после первого сбора здесь появятся ролики выше медианы."
      />
    </>
  );
}

async function AccountsTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const ctx = await requireProjectContext(projectId);
  const entries = await listWatchlist(ctx);
  const rows: AccountRow[] = entries.map((e) => ({
    entryId: e.id,
    status: e.status,
    market: e.market,
    niche: e.niche,
    username: e.account.username,
    fullName: e.account.fullName,
    avatarUrl: e.account.avatarUrl,
    followers: e.account.followers,
    medianViews: e.account.medianViews,
    reelsCount: e.account.reelsCount,
    viralCount: e.account.viralCount,
    rating: e.account.rating,
    lastScrapedAt: e.account.lastScrapedAt?.toISOString() ?? null,
    lastError: e.account.lastError,
  }));

  return (
    <div className="grid gap-4">
      {canManage && <AddAccountsForm projectId={projectId} />}
      <AccountsTable projectId={projectId} rows={rows} canManage={canManage} />
    </div>
  );
}
