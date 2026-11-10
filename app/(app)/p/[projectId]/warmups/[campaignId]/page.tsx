import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { DAY_KINDS, RUBRICS, WARMUP_CALENDAR_MONTHS } from "@/config/warmups";
import { requireProjectContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/navigation";
import { addDays, addMonths, dateToDay, daysBetween, monthEnd, monthStart, monthTitle, shortDay, weekStart, weekdayIndex, WEEKDAY_LABELS } from "@/lib/content/dates";
import { calendarPublications, getCampaign } from "@/lib/db/warmups";
import { cn } from "@/lib/utils";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { CampaignForm, DeleteCampaignButton, WarmupDayRow } from "@/components/work/warmup-forms";

export const metadata = { title: "Прогрев — Content CRM" };

const KIND = Object.fromEntries(DAY_KINDS.map((k) => [k.value, k]));
const RUBRIC = Object.fromEntries(RUBRICS.map((r) => [r.value, r]));

export default async function CampaignPage({ params }: PageProps<"/p/[projectId]/warmups/[campaignId]">) {
  const { projectId, campaignId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "warmups")) return <NoAccess />;

  const campaign = await getCampaign(ctx, campaignId);
  const start = dateToDay(campaign.startDate);
  const end = dateToDay(campaign.endDate);
  const sales = campaign.salesStartDate ? dateToDay(campaign.salesStartDate) : null;
  const months = Array.from({ length: WARMUP_CALENDAR_MONTHS }, (_, i) => addMonths(start, i));
  const publications = await calendarPublications(ctx, monthStart(start), monthEnd(months[months.length - 1]));
  const canEdit = can(ctx.role, "content.manage");

  const daysByDate = new Map(campaign.days.map((d) => [dateToDay(d.date), d]));
  const pubsByDate = new Map<string, typeof publications>();
  for (const p of publications) {
    const day = dateToDay(p.date!);
    pubsByDate.set(day, [...(pubsByDate.get(day) ?? []), p]);
  }
  const tableDays = Array.from({ length: daysBetween(start, end) + 1 }, (_, i) => addDays(start, i));

  return (
    <>
      <Link href={`/p/${projectId}/warmups`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeftIcon className="size-3.5" /> Все прогревы
      </Link>
      <PageHeader
        title={campaign.name}
        description={`${shortDay(start)} — ${shortDay(end)}${sales ? ` · старт продаж ${shortDay(sales)}` : ""}${campaign.product ? ` · ${campaign.product}` : ""}`}
        actions={
          <div className="flex gap-2">
            <Link href={`/p/${projectId}/warmups/${campaign.id}/board`} className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted">
              Доска
            </Link>
            {canEdit && <DeleteCampaignButton projectId={projectId} id={campaign.id} />}
          </div>
        }
      />

      {canEdit && (
        <details className="mb-6 rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">Изменить кампанию</summary>
          <div className="mt-3">
            <CampaignForm
              projectId={projectId}
              id={campaign.id}
              initial={{ name: campaign.name, product: campaign.product, startDate: start, endDate: end, salesStartDate: sales, note: campaign.note }}
            />
          </div>
        </details>
      )}

      <section className="mb-8 grid gap-3" aria-label="Календарь прогрева">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {DAY_KINDS.map((k) => (
            <span key={k.value} className={cn("rounded px-1.5 py-0.5", k.className)}>
              {k.label}
            </span>
          ))}
          {RUBRICS.map((r) => (
            <span key={r.value} className="flex items-center gap-1">
              <span className={cn("size-2 rounded-full", r.dot)} aria-hidden /> {r.label}
            </span>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {months.map((month) => {
            const gridStart = weekStart(monthStart(month));
            const gridDays = Array.from({ length: daysBetween(gridStart, addDays(weekStart(monthEnd(month)), 6)) + 1 }, (_, i) => addDays(gridStart, i));
            return (
              <div key={month} className="rounded-xl border p-2">
                <h3 className="mb-2 text-sm font-medium">{monthTitle(month)}</h3>
                <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
                  {WEEKDAY_LABELS.map((w) => (
                    <span key={w} className="text-muted-foreground">
                      {w}
                    </span>
                  ))}
                  {gridDays.map((day) => {
                    const inMonth = day.slice(0, 7) === month.slice(0, 7);
                    const inCampaign = day >= start && day <= end;
                    const kind = daysByDate.get(day)?.kind;
                    const dots = pubsByDate.get(day) ?? [];
                    return (
                      <a
                        key={day}
                        href={inCampaign ? `#day-${day}` : undefined}
                        title={[kind ? KIND[kind].label : "", day === sales ? "старт продаж" : "", ...dots.map((p) => p.title)].filter(Boolean).join(" · ") || undefined}
                        className={cn(
                          "grid h-11 content-start gap-0.5 rounded p-0.5",
                          !inMonth && "invisible",
                          inCampaign ? "bg-muted/50" : "text-muted-foreground",
                          kind && KIND[kind].className,
                          day === sales && "ring-2 ring-primary",
                        )}
                      >
                        <span className="tabular-nums">{Number(day.slice(8))}</span>
                        <span className="flex flex-wrap justify-center gap-0.5">
                          {dots.slice(0, 4).map((p) => (
                            <span key={p.id} className={cn("size-1.5 rounded-full", p.rubric ? RUBRIC[p.rubric].dot : "bg-foreground/30")} />
                          ))}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Точки — публикации из контент-плана, цвет — рубрика (рубрику ставите в карточке публикации). Клик по дню прогрева — к его строке в таблице.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="font-medium">По дням</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-muted/40 text-left text-xs">
              <tr>
                <th className="p-2 font-medium">Дата</th>
                <th className="p-2 font-medium">Значение дня</th>
                <th className="p-2 font-medium">Пост в Telegram</th>
                <th className="p-2 font-medium">Сторис</th>
                <th className="p-2 font-medium">Смыслы</th>
              </tr>
            </thead>
            <tbody>
              {tableDays.map((day) => {
                const saved = daysByDate.get(day);
                return (
                  <WarmupDayRow
                    key={day}
                    projectId={projectId}
                    campaignId={campaign.id}
                    day={day}
                    label={`${WEEKDAY_LABELS[weekdayIndex(day)]} ${shortDay(day)}${day === sales ? " · продажи" : ""}`}
                    canEdit={canEdit}
                    initial={{
                      kind: saved?.kind ?? null,
                      meaning: saved?.meaning ?? "",
                      telegramPost: saved?.telegramPost ?? "",
                      stories: saved?.stories ?? "",
                      meanings: saved?.meanings ?? [],
                    }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
