import Link from "next/link";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { todayDay } from "@/lib/content/dates";
import { bucketTasks, listTasks, taskFormOptions, toTaskItem } from "@/lib/db/tasks";
import { cn } from "@/lib/utils";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { TaskCreateButton, TaskItem } from "@/components/work/task-forms";

export const metadata = { title: "Задачи — Content CRM" };

const BUCKETS = [
  { key: "overdue", title: "Просрочено" },
  { key: "today", title: "Сегодня" },
  { key: "tomorrow", title: "Завтра" },
  { key: "later", title: "Позже" },
  { key: "noDate", title: "Без срока" },
] as const;

export default async function TasksPage({ params, searchParams }: PageProps<"/p/[projectId]/tasks">) {
  const { projectId } = await params;
  const query = await searchParams;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "tasks")) return <NoAccess />;

  const mine = query.who !== "all";
  const showDone = query.done === "1";
  const today = todayDay();
  const [tasks, options, done] = await Promise.all([
    listTasks(ctx, { mine }),
    taskFormOptions(ctx),
    showDone ? listTasks(ctx, { mine, includeDone: true }).then((all) => all.filter((t) => t.status === "DONE")) : Promise.resolve([]),
  ]);
  const buckets = bucketTasks(tasks, today);
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams({ who: mine ? "me" : "all", done: showDone ? "1" : "", ...changes });
    for (const [k, v] of [...next.entries()]) if (!v) next.delete(k);
    return `/p/${projectId}/tasks?${next.toString()}`;
  };
  const itemProps = { projectId, members: options.members, publications: options.publications, clients: options.clients };

  return (
    <>
      <PageHeader
        title="Задачи"
        description="Со сроком, исполнителем и привязкой к публикации или клиенту."
        actions={<TaskCreateButton {...itemProps} defaultAssigneeId={ctx.userId} today={today} />}
      />
      <nav className="mb-5 flex flex-wrap items-center gap-1 text-sm" aria-label="Фильтр">
        {[
          { label: "Мои", value: "me", active: mine },
          { label: "Все", value: "all", active: !mine },
        ].map((f) => (
          <Link key={f.value} href={href({ who: f.value })} aria-current={f.active ? "page" : undefined} className={cn("rounded-md px-3 py-1", f.active ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {f.label}
          </Link>
        ))}
        <Link href={href({ done: showDone ? "" : "1" })} className="ml-2 rounded-md px-3 py-1 text-muted-foreground hover:bg-muted">
          {showDone ? "Скрыть сделанные" : "Показать сделанные"}
        </Link>
      </nav>

      {tasks.length === 0 && done.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{mine ? "У вас нет открытых задач." : "Открытых задач нет."}</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {BUCKETS.filter((b) => buckets[b.key].length > 0).map((b) => (
            <section key={b.key} className="grid content-start gap-2">
              <h2 className={cn("text-sm font-medium", b.key === "overdue" && "text-destructive")}>
                {b.title} · {buckets[b.key].length}
              </h2>
              <ul className="grid gap-1.5">
                {buckets[b.key].map((t) => (
                  <TaskItem key={t.id} {...itemProps} task={toTaskItem(t, today, projectId)} />
                ))}
              </ul>
            </section>
          ))}
          {done.length > 0 && (
            <section className="grid content-start gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">Сделано · {done.length}</h2>
              <ul className="grid gap-1.5">
                {done.map((t) => (
                  <TaskItem key={t.id} {...itemProps} task={toTaskItem(t, today, projectId)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
