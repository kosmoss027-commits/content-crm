import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { requireProjectContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/navigation";
import { addDays, addMonths, dateToDay, isDay, monthEnd, monthStart, monthTitle, shortDay, todayDay, weekStart } from "@/lib/content/dates";
import { listPlan, listPublications, monthSummary, projectLabels, type ListFilters, type PlanItem } from "@/lib/db/publications";
import { cn } from "@/lib/utils";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { getConnection } from "@/lib/instagram/sync";
import { InstagramSyncButton } from "@/components/content/instagram-panel";
import { NewPublicationButton, PlanBoard, PlanFilters, type BoardItem, type BoardView } from "@/components/content/plan-board";

export const metadata = { title: "Контент-план — Content CRM" };

const VIEWS: { value: BoardView; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "list", label: "Список" },
];

function toBoard(item: PlanItem): BoardItem {
  return {
    id: item.id,
    title: item.title,
    day: item.date ? dateToDay(item.date) : null,
    platform: item.platform,
    type: item.type,
    status: item.status,
    isStar: item.isStar,
    views: item.views,
    codeWord: item.codeWord,
  };
}

const param = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

export default async function ContentPlanPage({ params, searchParams }: PageProps<"/p/[projectId]/content-plan">) {
  const { projectId } = await params;
  const query = await searchParams;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "content-plan")) return <NoAccess />;

  const view: BoardView = VIEWS.some((v) => v.value === query.view) ? (query.view as BoardView) : "week";
  const today = todayDay();
  const anchor = isDay(param(query.d)) ? param(query.d) : today;
  const filters: ListFilters = { platform: param(query.platform), type: param(query.type), status: param(query.status), label: param(query.label) };

  const start = weekStart(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const gridStart = weekStart(monthStart(anchor));
  const gridEnd = addDays(weekStart(monthEnd(anchor)), 6);
  const monthDays = Array.from({ length: Math.round((Date.parse(gridEnd) - Date.parse(gridStart)) / 86_400_000) + 1 }, (_, i) => {
    const day = addDays(gridStart, i);
    return { day, inMonth: day.slice(0, 7) === anchor.slice(0, 7) };
  });

  const [plan, list, summary, labels, instagram] = await Promise.all([
    view === "list" ? null : listPlan(ctx, view === "week" ? days[0] : gridStart, view === "week" ? days[6] : gridEnd, filters),
    view === "list" ? listPublications(ctx, filters) : null,
    monthSummary(ctx, anchor),
    projectLabels(ctx),
    getConnection(ctx),
  ]);

  const step = (direction: 1 | -1) => (view === "month" ? addMonths(anchor, direction) : addDays(anchor, 7 * direction));
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ view, d: anchor, ...filters, ...changes })) if (value) next.set(key, value);
    return `/p/${projectId}/content-plan?${next.toString()}`;
  };
  const periodTitle = view === "week" ? `${shortDay(days[0])} — ${shortDay(days[6])}` : monthTitle(anchor);

  return (
    <>
      <PageHeader
        title="Контент-план"
        description={`За ${monthTitle(anchor).toLowerCase()} опубликовано ${summary.published} из ${summary.planned}`}
        actions={
          can(ctx.role, "content.manage") ? (
            <div className="flex flex-wrap gap-2">
              {instagram && <InstagramSyncButton projectId={projectId} />}
              <NewPublicationButton />
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <nav className="inline-flex rounded-lg border p-0.5" aria-label="Вид">
            {VIEWS.map((v) => (
              <Link
                key={v.value}
                href={href({ view: v.value })}
                aria-current={view === v.value ? "page" : undefined}
                className={cn("rounded-md px-3 py-1 text-sm", view === v.value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {v.label}
              </Link>
            ))}
          </nav>
          {view !== "list" && (
            <div className="flex items-center gap-1">
              <Link href={href({ d: step(-1) })} className="rounded-md p-1.5 hover:bg-muted" aria-label="Назад">
                <ChevronLeftIcon className="size-4" />
              </Link>
              <Link href={href({ d: today })} className="rounded-md px-2 py-1 text-sm hover:bg-muted">
                Сегодня
              </Link>
              <Link href={href({ d: step(1) })} className="rounded-md p-1.5 hover:bg-muted" aria-label="Вперёд">
                <ChevronRightIcon className="size-4" />
              </Link>
              <span className="ml-1 text-sm font-medium">{periodTitle}</span>
            </div>
          )}
        </div>
        <PlanFilters labels={labels} values={{ platform: filters.platform ?? "", type: filters.type ?? "", status: filters.status ?? "", label: filters.label ?? "" }} />
      </div>

      <PlanBoard
        projectId={projectId}
        view={view}
        days={days}
        monthDays={monthDays}
        today={today}
        items={(plan?.dated ?? list ?? []).map(toBoard)}
        undated={(plan?.undated ?? []).map(toBoard)}
        canEdit={can(ctx.role, "content.manage")}
        openNewOnLoad={query.new === "1"}
      />
    </>
  );
}
