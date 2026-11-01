import Link from "next/link";
import type { ScriptStatus } from "@/lib/generated/prisma/enums";
import { can } from "@/lib/auth/permissions";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { listScripts, scriptCounts, SCRIPT_STATUSES } from "@/lib/db/scripts";
import { cn } from "@/lib/utils";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { ScriptList } from "@/components/factory/script-list";
import { SCRIPT_STATUS_LABELS } from "@/components/factory/script-card";
import { IdeaScriptForm } from "@/components/factory/factory-buttons";

export const metadata = { title: "Сценарии — Content CRM" };

export default async function ScriptsPage({ params, searchParams }: PageProps<"/p/[projectId]/scripts">) {
  const { projectId } = await params;
  const requested = (await searchParams).status;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "scripts")) return <NoAccess />;

  const status = SCRIPT_STATUSES.includes(requested as ScriptStatus) ? (requested as ScriptStatus) : undefined;
  const [scripts, counts] = await Promise.all([listScripts(ctx, status), scriptCounts(ctx)]);
  const canEdit = can(ctx.role, "research.manage");
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Сценарии" description="Все сценарии проекта по статусам: из разборов, хуков, трендов и ваших идей." />
      {canEdit && (
        <div className="mb-5">
          <IdeaScriptForm projectId={projectId} />
        </div>
      )}
      <nav className="mb-5 flex flex-wrap gap-1" aria-label="Статусы сценариев">
        {[undefined, ...SCRIPT_STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/p/${projectId}/scripts?status=${s}` : `/p/${projectId}/scripts`}
            className={cn("rounded-md border px-3 py-1 text-sm", s === status ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {s ? SCRIPT_STATUS_LABELS[s] : "Все"} · {s ? counts[s] : total}
          </Link>
        ))}
      </nav>
      <ScriptList projectId={projectId} scripts={scripts} canEdit={canEdit} empty="Сценариев пока нет." />
    </>
  );
}
