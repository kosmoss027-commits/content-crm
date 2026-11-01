import { SCRAPE_BUDGET, SCRAPE_SCHEDULE } from "@/config/scraping";
import { can } from "@/lib/auth/permissions";
import { requireProjectContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { listWorkspaceProjects } from "@/lib/db/projects";
import { getWorkspaceUsage } from "@/lib/db/workspaces";
import { Badge } from "@/components/ui/badge";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { CreateProjectForm, ProjectRow, ThresholdsForm, WorkspaceNameForm } from "@/components/settings/settings-client";

export const metadata = { title: "Настройки — Content CRM" };

export default async function SettingsPage({ params }: PageProps<"/p/[projectId]/settings">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!can(ctx.role, "settings.view")) return <NoAccess />;

  const [projects, usage, thresholds] = await Promise.all([
    listWorkspaceProjects(ctx),
    getWorkspaceUsage(ctx),
    prisma.project.findUniqueOrThrow({ where: { id: ctx.projectId }, select: { viralThreshold: true, anomalyThreshold: true } }),
  ]);

  return (
    <>
      <PageHeader title="Настройки" description="Пространство, проекты, тариф и лимиты." />
      <div className="grid gap-10">
        <SettingsBlock title="Пространство">
          <WorkspaceNameForm projectId={projectId} name={ctx.workspace.name} />
        </SettingsBlock>

        <SettingsBlock title="Проекты" id="projects">
          <ul className="grid gap-2">
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                projectId={projectId}
                project={{
                  id: project.id,
                  name: project.name,
                  color: project.color,
                  archived: project.archivedAt !== null,
                  current: project.id === projectId,
                }}
              />
            ))}
          </ul>
          <CreateProjectForm projectId={projectId} />
        </SettingsBlock>

        <SettingsBlock title={`Тариф: ${usage.plan.title}`}>
          <div className="grid gap-2 sm:grid-cols-2">
            {usage.rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="tabular-nums">
                  {row.used} / {row.limit ?? "∞"}
                  {row.note && (
                    <Badge variant="outline" className="ml-2">
                      {row.note}
                    </Badge>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Лимиты тарифов задаются в config/plans.ts.</p>
        </SettingsBlock>

        <SettingsBlock title="Разведка: залёты" id="research">
          <ThresholdsForm projectId={projectId} viral={thresholds.viralThreshold} anomaly={thresholds.anomalyThreshold} />
          <ul className="grid gap-1 text-sm text-muted-foreground">
            <li>
              Плановый сбор: раз в {SCRAPE_SCHEDULE.everyDays} дн. в {String(SCRAPE_SCHEDULE.hour).padStart(2, "0")}:00
              ({SCRAPE_SCHEDULE.timeZone}), ролики за последние {SCRAPE_SCHEDULE.windowDays} дн.
            </li>
            <li>
              Лимит расходов на сбор: ${SCRAPE_BUDGET.monthlyUsd} в месяц, ${SCRAPE_BUDGET.perRunUsd} за один запуск.
            </li>
            <li className="text-xs">Расписание и лимиты задаются в config/scraping.ts.</li>
          </ul>
        </SettingsBlock>

        <SettingsBlock title="Ключи API">
          <Upcoming stage={3} text="Apify подключён на сервере. Ключи Claude и распознавания речи понадобятся на этапе 3." />
        </SettingsBlock>

        <SettingsBlock title="Шаблон сценария">
          <Upcoming stage={3} text="Ваш шаблон: хук → кадры → финал, с подсказками «что снимать»." />
        </SettingsBlock>
      </div>
    </>
  );
}

function SettingsBlock({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-16 gap-3">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Upcoming({ stage, text }: { stage: number; text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
      <Badge variant="secondary">Этап {stage}</Badge>
      {text}
    </p>
  );
}
