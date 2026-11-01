import Link from "next/link";
import { HOOK_TYPES } from "@/lib/ai/prompts";
import type { ProjectContext } from "@/lib/db/access";
import { listHooks, whatWorks, type WorksRow } from "@/lib/db/analysis";
import { listHypotheses } from "@/lib/db/scripts";
import { formatMultiplier } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HypothesesPanel } from "@/components/factory/brand-panels";
import { CreateScriptButton } from "@/components/factory/factory-buttons";

type Query = Record<string, string | string[] | undefined>;
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

export async function HooksTab({ ctx, query, canEdit }: { ctx: ProjectContext; query: Query; canEdit: boolean }) {
  const type = str(query.type);
  const q = str(query.q);
  const hooks = await listHooks(ctx, { type, q });
  const base = `/p/${ctx.projectId}/research`;

  return (
    <div className="grid gap-4">
      <form action={base} className="flex flex-wrap gap-2">
        <input type="hidden" name="tab" value="hooks" />
        {type && <input type="hidden" name="type" value={type} />}
        <Input name="q" defaultValue={q} placeholder="Поиск по хукам" className="h-8 max-w-xs" aria-label="Поиск по хукам" />
        <Button size="sm" variant="secondary" type="submit">
          Найти
        </Button>
      </form>
      <div className="flex flex-wrap gap-1">
        {[undefined, ...HOOK_TYPES].map((t) => (
          <Link
            key={t ?? "all"}
            href={`${base}?tab=hooks${t ? `&type=${encodeURIComponent(t)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={cn("rounded-full border px-2.5 py-0.5 text-xs", t === type ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {t ?? "все типы"}
          </Link>
        ))}
      </div>
      {hooks.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Хуков пока нет. Они появляются после разбора залётов — автоматически, раз в час.
        </p>
      ) : (
        <ul className="grid gap-2">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2">
              <div className="grid min-w-0 flex-1 gap-1">
                <p className="text-sm">«{h.hook}»</p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{h.hookType}</Badge>
                  <Link href={`${base}/reel/${h.reel.id}`} className="hover:underline">
                    @{h.reel.account.username} {formatMultiplier(h.reel.multiplier)}
                  </Link>
                  {h.topic && <span>· {h.topic}</span>}
                </p>
              </div>
              {canEdit && <CreateScriptButton projectId={ctx.projectId} analysisId={h.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WorksCard({ title, rows }: { title: string; rows: WorksRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="grid content-start gap-2 rounded-xl border p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">нет данных</p>
      ) : (
        <ul className="grid gap-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="grid gap-0.5">
              <div className="flex justify-between gap-2">
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {r.count} · ср. ×{r.avgMultiplier}
                </span>
              </div>
              <div className="h-1 rounded-full bg-muted">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PERIODS = [7, 30, 90];

export async function WorksTab({ ctx, query }: { ctx: ProjectContext; query: Query }) {
  const period = PERIODS.includes(Number(query.period)) ? Number(query.period) : 30;
  const data = await whatWorks(ctx, period);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/p/${ctx.projectId}/research?tab=works&period=${p}`}
            className={cn("rounded-md border px-3 py-1 text-sm", p === period ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {p} дней
          </Link>
        ))}
        <span className="text-xs text-muted-foreground">разобрано залётов: {data.total}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <WorksCard title="Темы" rows={data.topics} />
        <WorksCard title="Типы хуков" rows={data.hookTypes} />
        <WorksCard title="Форматы" rows={data.formats} />
        <WorksCard title="Длительность" rows={data.durations} />
        <WorksCard title="Приёмы" rows={data.techniques} />
      </div>
    </div>
  );
}

export async function HypothesesTab({ ctx, canEdit }: { ctx: ProjectContext; canEdit: boolean }) {
  const hypotheses = await listHypotheses(ctx);
  return (
    <HypothesesPanel
      projectId={ctx.projectId}
      canEdit={canEdit}
      hypotheses={hypotheses.map((h) => ({
        id: h.id,
        text: h.text,
        note: h.note,
        status: h.status,
        reels: h.reels.map(({ reel }) => ({ id: reel.id, url: reel.url, label: `@${reel.account.username} ${formatMultiplier(reel.multiplier)}` })),
      }))}
    />
  );
}
