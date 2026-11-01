import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { prisma } from "@/lib/db/prisma";
import { listRadar } from "@/lib/db/reels";
import { cn } from "@/lib/utils";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { ReelGrid } from "@/components/research/reel-grid";

export const metadata = { title: "Радар трендов — Content CRM" };

const WINDOWS = [24, 48, 72];

export default async function TrendsPage({ params, searchParams }: PageProps<"/p/[projectId]/trends">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "trends")) return <NoAccess />;

  const requested = Number((await searchParams).hours);
  const hours = WINDOWS.includes(requested) ? requested : 72;
  const [reels, project] = await Promise.all([
    listRadar(ctx, hours),
    prisma.project.findUniqueOrThrow({ where: { id: ctx.projectId }, select: { anomalyThreshold: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Радар трендов"
        description={`Аномальные залёты (от ×${project.anomalyThreshold} к медиане) за последние ${hours} часа. «В работу» — чтобы не потерять; задачи появятся на этапе 6.`}
      />
      <div className="mb-4 flex gap-1">
        {WINDOWS.map((h) => (
          <Link
            key={h}
            href={`/p/${projectId}/trends?hours=${h}`}
            className={cn("rounded-md border px-3 py-1 text-sm", h === hours ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {h} ч
          </Link>
        ))}
      </div>
      <ReelGrid
        projectId={projectId}
        reels={reels}
        anomalyThreshold={project.anomalyThreshold}
        canMark={can(ctx.role, "research.manage")}
        empty="За это время аномальных залётов нет. Сбор идёт раз в 3 дня — свежие ролики можно подтянуть кнопкой «Собрать все сейчас» в Разведке."
      />
    </>
  );
}
