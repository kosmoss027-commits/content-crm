import { ArrowDownRightIcon, ArrowUpRightIcon, DownloadIcon } from "lucide-react";
import { PLATFORMS, PUBLICATION_TYPES } from "@/config/content";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { shortDay, todayDay, WEEKDAY_NAMES } from "@/lib/content/dates";
import { bestWeekday, changePct, computeTiles, PERIODS, resolvePeriod, TILES, topAndBottom, type TileValues } from "@/lib/content/stats";
import { projectLabels, publishedRows, type ListFilters } from "@/lib/db/publications";
import { moneySummary } from "@/lib/db/sales";
import { formatCount, formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { PublicationsTable, RankList, ViewsChart } from "@/components/content/stats-view";

export const metadata = { title: "Статистика — Content CRM" };

const param = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

function formatTile(value: number | null, format: (typeof TILES)[number]["format"]): string {
  if (value === null) return "—";
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "seconds") return `${value.toFixed(1)} с`;
  return formatCount(Math.round(value));
}

const selectClass = "h-8 rounded-md border bg-transparent px-2 text-sm";

export default async function StatsPage({ params, searchParams }: PageProps<"/p/[projectId]/stats">) {
  const { projectId } = await params;
  const query = await searchParams;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "stats")) return <NoAccess />;

  const today = todayDay();
  const period = resolvePeriod(param(query.period), today, { from: param(query.from), to: param(query.to) });
  const filters: ListFilters = { platform: param(query.platform), type: param(query.type), label: param(query.label) };

  const showMoney = canOpenSection(ctx.role, "keywords");
  const [rows, previousRows, labels, money, previousMoney] = await Promise.all([
    publishedRows(ctx, period.current, filters),
    period.previous ? publishedRows(ctx, period.previous, filters) : Promise.resolve(null),
    projectLabels(ctx),
    showMoney ? moneySummary(ctx, period.current) : null,
    showMoney && period.previous ? moneySummary(ctx, period.previous) : null,
  ]);
  const moneyTiles = money
    ? [
        { key: "leads", label: "Заявки", value: formatCount(money.leads), change: previousMoney ? changePct(money.leads, previousMoney.leads) : null },
        { key: "payments", label: "Оплаты", value: formatCount(money.payments), change: previousMoney ? changePct(money.payments, previousMoney.payments) : null },
        { key: "revenue", label: "Выручка", value: formatRub(money.revenueRub), change: previousMoney ? changePct(money.revenueRub, previousMoney.revenueRub) : null },
      ]
    : [];
  const tiles = computeTiles(rows);
  const previous: TileValues | null = previousRows ? computeTiles(previousRows) : null;
  const best = bestWeekday(rows);
  const { top, bottom } = topAndBottom(rows);
  const exportQuery = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string")).toString();

  return (
    <>
      <PageHeader
        title="Статистика"
        description={
          period.current
            ? `Опубликованное с ${shortDay(period.current.from)} по ${shortDay(period.current.to)}${period.previous ? " — в сравнении с таким же периодом до него" : ""}`
            : "Всё опубликованное"
        }
        actions={
          <Button asChild size="sm" variant="outline">
            <a href={`/p/${projectId}/stats/export?${exportQuery}`} download>
              <DownloadIcon />
              Скачать CSV
            </a>
          </Button>
        }
      />

      <form className="mb-5 flex flex-wrap items-end gap-2" method="get" aria-label="Фильтры статистики">
        <select name="period" defaultValue={period.key} className={selectClass} aria-label="Период">
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={param(query.from)} className={selectClass} aria-label="Свой период: с" />
        <input type="date" name="to" defaultValue={param(query.to)} className={selectClass} aria-label="Свой период: по" />
        <select name="platform" defaultValue={filters.platform} className={selectClass} aria-label="Площадка">
          <option value="">Все площадки</option>
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={filters.type} className={selectClass} aria-label="Формат">
          <option value="">Все форматы</option>
          {PUBLICATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {labels.length > 0 && (
          <select name="label" defaultValue={filters.label} className={selectClass} aria-label="Метка">
            <option value="">Все метки</option>
            {labels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" size="sm">
          Показать
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          За этот период нет опубликованного. Поставьте публикациям статус «Опубликовано» в контент-плане и внесите просмотры — или подключите Instagram.
        </p>
      ) : (
        <div className="grid gap-6">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {[
              ...TILES.map((tile) => ({
                key: tile.key,
                label: tile.label,
                value: formatTile(tiles[tile.key], tile.format),
                change: previous ? changePct(tiles[tile.key], previous[tile.key]) : null,
              })),
              ...moneyTiles,
            ].map(({ key, label, value, change }) => {
              return (
                <div key={key} className="grid gap-1 rounded-xl border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold tabular-nums">{value}</span>
                    {change !== null && Math.abs(change) >= 0.5 && (
                      <span className={cn("inline-flex items-center text-xs tabular-nums", change > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {change > 0 ? <ArrowUpRightIcon className="size-3" aria-label="рост" /> : <ArrowDownRightIcon className="size-3" aria-label="падение" />}
                        {Math.abs(change).toFixed(0)}%
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          <ViewsChart projectId={projectId} rows={rows} median={tiles.medianViews} />

          <div className="grid gap-3 md:grid-cols-3">
            <section className="grid content-start gap-1 rounded-xl border p-3">
              <h2 className="text-sm font-medium">Лучший день недели</h2>
              {best ? (
                <>
                  <p className="text-lg font-semibold first-letter:uppercase">{WEEKDAY_NAMES[best.weekday]}</p>
                  <p className="text-xs text-muted-foreground">
                    в среднем {formatCount(Math.round(best.avgViews))} просмотров ({best.count} публ.)
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Нужны просмотры.</p>
              )}
            </section>
            <RankList projectId={projectId} title="Топ-5 по просмотрам" rows={top} />
            <RankList projectId={projectId} title="Слабые 5" rows={bottom} />
          </div>

          <section className="grid gap-2">
            <h2 className="text-sm font-medium">Все публикации за период</h2>
            <PublicationsTable projectId={projectId} rows={rows} />
          </section>
        </div>
      )}
    </>
  );
}
