import Link from "next/link";
import { requireProjectContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/navigation";
import { addDays, dateToDay, shortDay, todayDay } from "@/lib/content/dates";
import { listCampaigns } from "@/lib/db/warmups";
import { Badge } from "@/components/ui/badge";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { CampaignCreateButton } from "@/components/work/warmup-forms";

export const metadata = { title: "Прогревы — Content CRM" };

export default async function WarmupsPage({ params }: PageProps<"/p/[projectId]/warmups">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "warmups")) return <NoAccess />;

  const today = todayDay();
  const campaigns = await listCampaigns(ctx);

  return (
    <>
      <PageHeader
        title="Прогревы"
        description="Кампании прогрева: период, продукт, старт продаж, календарь на 3 месяца и смыслы по дням."
        actions={can(ctx.role, "content.manage") ? <CampaignCreateButton projectId={projectId} today={today} inMonth={addDays(today, 27)} /> : undefined}
      />
      {campaigns.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Прогревов пока нет. Создайте первый — например, на 4 недели до старта продаж.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {campaigns.map((c) => {
            const start = dateToDay(c.startDate);
            const end = dateToDay(c.endDate);
            const state = today < start ? "скоро" : today > end ? "завершён" : "идёт";
            return (
              <li key={c.id}>
                <Link href={`/p/${projectId}/warmups/${c.id}`} className="grid gap-1 rounded-xl border p-3 hover:bg-muted/40">
                  <span className="flex items-center justify-between gap-2 font-medium">
                    {c.name}
                    <Badge variant={state === "идёт" ? "default" : "secondary"}>{state}</Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {shortDay(start)} — {shortDay(end)}
                    {c.salesStartDate ? ` · старт продаж ${shortDay(dateToDay(c.salesStartDate))}` : ""}
                    {c.product ? ` · ${c.product}` : ""} · публикаций {c._count.publications}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
