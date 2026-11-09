import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { analysisCounts } from "@/lib/db/analysis";
import { listScripts, scriptCounts, SCRIPT_STATUSES } from "@/lib/db/scripts";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { ScriptList } from "@/components/factory/script-list";
import { SCRIPT_STATUS_LABELS } from "@/components/factory/script-card";
import { IdeaScriptForm } from "@/components/factory/factory-buttons";
import { todayDay } from "@/lib/content/dates";
import { myUpcomingTasks, taskFormOptions, toTaskItem } from "@/lib/db/tasks";
import { TaskCreateButton, TaskItem } from "@/components/work/task-forms";

export const metadata = { title: "Сегодня — Content CRM" };

export default async function TodayPage({ params }: PageProps<"/p/[projectId]/today">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "today")) return <NoAccess />;

  const today = todayDay();
  const [counts, review, inProgress, queue, myTasks, taskOptions] = await Promise.all([
    scriptCounts(ctx),
    listScripts(ctx, "REVIEW"),
    Promise.all((["SHOOT", "EDIT", "PUBLISH"] as const).map((s) => listScripts(ctx, s))).then((lists) => lists.flat()),
    analysisCounts(ctx),
    myUpcomingTasks(ctx, today),
    taskFormOptions(ctx),
  ]);
  const canEdit = can(ctx.role, "research.manage");

  return (
    <>
      <PageHeader
        title="Сегодня"
        description="Сценарии на одобрение и в работе. Черновики из лучших залётов появляются сами каждое утро."
      />
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SCRIPT_STATUSES.map((status) => (
          <Link key={status} href={`/p/${projectId}/scripts?status=${status}`} className="rounded-xl border px-3 py-2 hover:bg-muted/50">
            <p className="text-xs text-muted-foreground">{SCRIPT_STATUS_LABELS[status]}</p>
            <p className="text-2xl font-semibold tabular-nums">{counts[status]}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_260px]">
        <div className="grid content-start gap-8">
          {canEdit && <IdeaScriptForm projectId={projectId} />}
          <section className="grid gap-3">
            <h2 className="font-medium">На одобрении · {review.length}</h2>
            <ScriptList
              projectId={projectId}
              scripts={review}
              canEdit={canEdit}
              empty={`Новых черновиков нет. В очереди разбора: ${queue.QUEUED ?? 0}, разобрано: ${queue.ANALYZED ?? 0}. Сценарий можно сделать из разбора ролика или по своей идее.`}
            />
          </section>
          {inProgress.length > 0 && (
            <section className="grid gap-3">
              <h2 className="font-medium">В работе · {inProgress.length}</h2>
              <ScriptList projectId={projectId} scripts={inProgress} canEdit={canEdit} empty="" />
            </section>
          )}
        </div>
        <aside className="grid content-start gap-2 rounded-xl border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/p/${projectId}/tasks`} className="font-medium hover:underline">
              Мои задачи
            </Link>
            <TaskCreateButton projectId={projectId} {...taskOptions} defaultAssigneeId={ctx.userId} today={today} />
          </div>
          {myTasks.length === 0 ? (
            <p className="text-muted-foreground">Просроченных и на сегодня-завтра нет.</p>
          ) : (
            <ul className="grid gap-1.5">
              {myTasks.map((t) => (
                <TaskItem key={t.id} projectId={projectId} task={toTaskItem(t, today, projectId)} {...taskOptions} compact />
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}
