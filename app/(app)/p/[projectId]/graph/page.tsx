import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { connectionChains, type GraphNode } from "@/lib/db/graph";
import { formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NoAccess, PageHeader } from "@/components/section-placeholder";

export const metadata = { title: "Связи — Content CRM" };

function Node({ node, empty, tone }: { node: GraphNode | null; empty: string; tone: string }) {
  if (!node) return <div className="rounded-lg border border-dashed px-2 py-1.5 text-xs text-muted-foreground">{empty}</div>;
  const body = (
    <>
      <span className="line-clamp-2 text-sm font-medium">{node.label}</span>
      {node.sub && <span className="text-xs text-muted-foreground">{node.sub}</span>}
    </>
  );
  return node.href ? (
    <Link href={node.href} className={cn("grid gap-0.5 rounded-lg border px-2 py-1.5 hover:ring-2 hover:ring-ring/30", tone)}>
      {body}
    </Link>
  ) : (
    <div className={cn("grid gap-0.5 rounded-lg border px-2 py-1.5", tone)}>{body}</div>
  );
}

function Arrow({ active }: { active: boolean }) {
  return <ArrowRightIcon className={cn("mx-auto size-4 shrink-0", active ? "text-foreground/60" : "text-muted-foreground/30")} aria-hidden />;
}

export default async function GraphPage({ params }: PageProps<"/p/[projectId]/graph">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "graph")) return <NoAccess />;

  const chains = await connectionChains(ctx);
  const withMoney = chains.filter((c) => c.money.revenueRub > 0);
  const fromReels = withMoney.filter((c) => c.reel).reduce((sum, c) => sum + c.money.revenueRub, 0);

  return (
    <>
      <PageHeader
        title="Связи"
        description="Какой чужой ролик вдохновил сценарий, какая публикация из него вышла и сколько она принесла."
      />
      {chains.length > 0 && (
        <p className="mb-4 text-sm">
          Публикаций с деньгами: <span className="font-semibold">{withMoney.length}</span>
          {fromReels > 0 && (
            <>
              {" "}
              · из них по референсам из разведки: <span className="font-semibold">{formatRub(fromReels)}</span>
            </>
          )}
        </p>
      )}
      {chains.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Связей пока нет. Они появятся, когда публикации будут из сценариев (кнопка «В контент-план»), с роликом-референсом или с заявками.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[52rem] grid-cols-[1fr_1.5rem_1fr_1.5rem_1.3fr_1.5rem_1fr] items-center gap-y-2 text-left">
            {["Ролик-референс", "", "Сценарий", "", "Публикация", "", "Заявки и деньги"].map((title, i) => (
              <span key={i} className="pb-1 text-xs font-medium text-muted-foreground">
                {title}
              </span>
            ))}
            {chains.map((c) => (
              <div key={c.publication.id} className="contents">
                <Node node={c.reel} empty="—" tone="bg-sky-50 dark:bg-sky-950/40" />
                <Arrow active={Boolean(c.reel)} />
                <Node node={c.script} empty="без сценария" tone="bg-violet-50 dark:bg-violet-950/40" />
                <Arrow active={Boolean(c.script || c.reel)} />
                <Node node={c.publication} empty="" tone="bg-background" />
                <Arrow active={c.money.leads > 0} />
                <div className={cn("grid gap-0.5 rounded-lg border px-2 py-1.5 text-xs", c.money.revenueRub > 0 ? "bg-emerald-50 dark:bg-emerald-950/40" : "border-dashed text-muted-foreground")}>
                  <span>
                    {c.money.keyword ? <span className="font-semibold tracking-wide">{c.money.keyword.toUpperCase()} · </span> : null}
                    заявок {c.money.leads} · купили {c.money.buyers}
                  </span>
                  {c.money.revenueRub > 0 && <span className="text-sm font-semibold text-foreground">{formatRub(c.money.revenueRub)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Деньги публикации — оплаты клиентов, чья заявка пришла с неё (первое касание). Показаны последние 40 публикаций со связями.</p>
    </>
  );
}
