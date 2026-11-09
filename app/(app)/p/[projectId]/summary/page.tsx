import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { PLATFORMS } from "@/config/content";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { addDays, dateToDay, todayDay } from "@/lib/content/dates";
import { listPlan } from "@/lib/db/publications";
import { listRadar } from "@/lib/db/reels";
import { moneySummary } from "@/lib/db/sales";
import { scriptCounts } from "@/lib/db/scripts";
import { myUpcomingTasks, taskFormOptions, toTaskItem } from "@/lib/db/tasks";
import { formatCount, formatMultiplier, formatRub } from "@/lib/format";
import { PageHeader } from "@/components/section-placeholder";
import { TaskItem } from "@/components/work/task-forms";

export const metadata = { title: "Сводка — Content CRM" };

const PLATFORM_LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label]));

function Card({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-2 rounded-xl border p-3">
      <h2 className="flex items-center justify-between gap-2 text-sm font-medium">
        {title}
        {href && (
          <Link href={href} className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground hover:underline">
            открыть <ArrowRightIcon className="size-3" />
          </Link>
        )}
      </h2>
      {children}
    </section>
  );
}

export default async function SummaryPage({ params }: PageProps<"/p/[projectId]/summary">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  const today = todayDay();
  const tomorrow = addDays(today, 1);
  const sees = (slug: string) => canOpenSection(ctx.role, slug);

  const [plan, tasks, options, weekMoney, monthMoney, virals, scripts] = await Promise.all([
    sees("content-plan") ? listPlan(ctx, today, tomorrow) : null,
    myUpcomingTasks(ctx, today),
    taskFormOptions(ctx),
    sees("leads") ? moneySummary(ctx, { from: addDays(today, -6), to: today }) : null,
    sees("leads") ? moneySummary(ctx, { from: `${today.slice(0, 8)}01`, to: today }) : null,
    sees("trends") ? listRadar(ctx, 72) : null,
    sees("today") ? scriptCounts(ctx) : null,
  ]);
  const toPublish = plan?.dated.filter((p) => p.status !== "PUBLISHED") ?? [];

  return (
    <>
      <PageHeader title="Сводка" description="Главное за сегодня и неделю." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plan && (
          <Card title="Выложить сегодня и завтра" href={`/p/${projectId}/content-plan`}>
            {toPublish.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ничего не запланировано.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {toPublish.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{p.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {dateToDay(p.date!) === today ? "сегодня" : "завтра"} · {PLATFORM_LABEL[p.platform]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card title="Мои задачи" href={`/p/${projectId}/tasks`}>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">На сегодня и завтра задач нет.</p>
          ) : (
            <ul className="grid gap-1.5">
              {tasks.map((t) => (
                <TaskItem key={t.id} projectId={projectId} task={toTaskItem(t, today, projectId)} {...options} compact />
              ))}
            </ul>
          )}
        </Card>

        {weekMoney && monthMoney && (
          <Card title="Заявки и деньги" href={`/p/${projectId}/keywords`}>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-xs text-muted-foreground">Заявок за 7 дней</dt>
                <dd className="text-xl font-semibold tabular-nums">{weekMoney.leads}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Оплат в месяце</dt>
                <dd className="text-xl font-semibold tabular-nums">{monthMoney.payments}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Выручка в месяце</dt>
                <dd className="text-xl font-semibold tabular-nums">{formatRub(monthMoney.revenueRub)}</dd>
              </div>
            </dl>
          </Card>
        )}

        {scripts && (
          <Card title="Сценарии" href={`/p/${projectId}/today`}>
            <p className="text-sm">
              На одобрении: <span className="font-semibold tabular-nums">{scripts.REVIEW}</span> · снять: <span className="tabular-nums">{scripts.SHOOT}</span> · монтаж:{" "}
              <span className="tabular-nums">{scripts.EDIT}</span>
            </p>
          </Card>
        )}

        {virals && (
          <Card title="Аномальные залёты за 3 дня" href={`/p/${projectId}/trends`}>
            {virals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет. Свежие ролики — кнопкой «Собрать и разобрать всё» в Разведке.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {virals.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-2">
                    <Link href={`/p/${projectId}/research/reel/${r.id}`} className="truncate hover:underline">
                      @{r.account.username} · {r.caption?.slice(0, 50) || "без подписи"}
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums">
                      {formatMultiplier(r.multiplier)} · {formatCount(r.views)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
