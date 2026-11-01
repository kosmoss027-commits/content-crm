import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { can } from "@/lib/auth/permissions";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { AppError } from "@/lib/db/errors";
import { getReelWithAnalysis } from "@/lib/db/analysis";
import { listHypotheses } from "@/lib/db/scripts";
import { formatCount, formatDate, formatDuration, formatMultiplier } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { NoAccess } from "@/components/section-placeholder";
import { CreateScriptButton, LinkHypothesisSelect, RequestAnalysisButton, SaveTechniqueButton } from "@/components/factory/factory-buttons";
import { SCRIPT_STATUS_LABELS } from "@/components/factory/script-card";

export const metadata = { title: "Разбор ролика — Content CRM" };

const STATUS_TEXT: Record<string, string> = {
  QUEUED: "В очереди на разбор",
  FILTERED: "Отсеян проверкой на пользу",
  ANALYZED: "Разобран",
  FAILED: "Разбор не удался",
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default async function ReelPage({ params }: PageProps<"/p/[projectId]/research/reel/[reelId]">) {
  const { projectId, reelId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "research")) return <NoAccess />;

  const reel = await getReelWithAnalysis(ctx, reelId).catch((error) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const hypotheses = await listHypotheses(ctx);
  const canEdit = can(ctx.role, "research.manage");
  const a = reel.analysis;
  const structure = Array.isArray(a?.structure) ? (a.structure as { block: string; summary: string }[]) : [];

  return (
    <div className="grid gap-6">
      <Link href={`/p/${projectId}/research`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Разведка
      </Link>

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <a href={reel.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border bg-muted">
          {reel.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={reel.coverUrl} alt="" referrerPolicy="no-referrer" className="aspect-[9/16] w-full object-cover" />
          )}
        </a>

        <div className="grid content-start gap-5">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">@{reel.account.username}</h1>
              <Badge className="bg-amber-400 text-black">{formatMultiplier(reel.multiplier)}</Badge>
              <a href={reel.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
                Открыть в Instagram <ExternalLinkIcon className="size-3" />
              </a>
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatCount(reel.views)} просм. · медиана {formatCount(reel.account.medianViews)} · {formatDuration(reel.durationSec)} · {formatDate(reel.postedAt)}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{a ? STATUS_TEXT[a.status] : "Ещё не разбирался"}</Badge>
              {a?.relevance !== null && a?.relevance !== undefined && (
                <span className="text-xs text-muted-foreground">польза для проекта: {a.relevance}/10 — {a.relevanceReason}</span>
              )}
            </div>
            {a?.error && <p className="text-sm text-destructive">{a.error}</p>}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {a?.status === "ANALYZED" ? (
                  <CreateScriptButton projectId={projectId} analysisId={a.id} />
                ) : (
                  a?.status !== "QUEUED" && <RequestAnalysisButton projectId={projectId} reelId={reel.id} label={a ? "Разобрать всё равно" : "Разобрать сейчас"} />
                )}
                <LinkHypothesisSelect projectId={projectId} reelId={reel.id} hypotheses={hypotheses.map((h) => ({ id: h.id, text: h.text }))} />
              </div>
            )}
          </div>

          {a?.status === "ANALYZED" && (
            <>
              <Block title={`Хук · ${a.hookType ?? ""}`}>
                <p className="rounded-lg bg-amber-400/10 px-3 py-2">{a.hook}</p>
              </Block>
              <Block title="Структура">
                <ol className="grid gap-1 text-sm">
                  {structure.map((s, i) => (
                    <li key={i}>
                      <span className="font-medium">{s.block}:</span> {s.summary}
                    </li>
                  ))}
                </ol>
              </Block>
              <Block title="Приёмы подачи">
                <ul className="flex flex-wrap gap-1.5">
                  {a.techniques.map((t) => (
                    <li key={t} className="flex items-center gap-0.5 rounded-full border py-0.5 pr-1 pl-2.5 text-xs">
                      {t}
                      {canEdit && <SaveTechniqueButton projectId={projectId} title={t} exampleUrl={reel.url} />}
                    </li>
                  ))}
                </ul>
              </Block>
              <Block title="Почему залетело">
                <ul className="list-disc pl-5 text-sm">
                  {a.whyItWorked.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Block>
              {(a.cta || a.codeWord) && (
                <Block title="Призыв">
                  <p className="text-sm">
                    {a.cta} {a.codeWord && <Badge variant="outline">кодовое слово: {a.codeWord}</Badge>}
                  </p>
                </Block>
              )}
              <Block title="Как адаптировать под проект">
                <ul className="list-disc pl-5 text-sm">
                  {a.adaptationIdeas.map((idea) => (
                    <li key={idea}>{idea}</li>
                  ))}
                </ul>
              </Block>
              <p className="text-xs text-muted-foreground">
                Тема: {a.topic} · формат: {a.format} · ниша: {a.niche} · стоимость разбора ${a.costUsd.toFixed(3)}
              </p>
              {a.scripts.length > 0 && (
                <Block title="Сценарии по этому ролику">
                  <ul className="text-sm">
                    {a.scripts.map((s) => (
                      <li key={s.id}>
                        <Link href={`/p/${projectId}/scripts?status=${s.status}`} className="hover:underline">
                          {s.title}
                        </Link>{" "}
                        <span className="text-xs text-muted-foreground">· {SCRIPT_STATUS_LABELS[s.status]}</span>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
            </>
          )}

          {reel.media?.transcript && (
            <Block title="Расшифровка">
              <p className="text-sm whitespace-pre-line text-muted-foreground">{reel.media.transcript}</p>
            </Block>
          )}
          {reel.caption && (
            <Block title="Подпись">
              <p className="text-sm whitespace-pre-line text-muted-foreground">{reel.caption}</p>
            </Block>
          )}
          {reel.hypotheses.length > 0 && (
            <Block title="В гипотезах">
              <ul className="text-sm">
                {reel.hypotheses.map(({ hypothesis }) => (
                  <li key={hypothesis.id}>{hypothesis.text}</li>
                ))}
              </ul>
            </Block>
          )}
        </div>
      </div>
    </div>
  );
}
