import Link from "next/link";
import { requireProjectContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/navigation";
import { dateToDay, shortDay, todayDay } from "@/lib/content/dates";
import { leadCounts, listKeywords, listLeads, publicationOptions } from "@/lib/db/sales";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { LEAD_STATUSES, SOURCE_LABEL } from "@/config/sales";
import { LeadActions, LeadCreateButton } from "@/components/sales/sales-forms";

export const metadata = { title: "Заявки — Content CRM" };


export default async function LeadsPage({ params, searchParams }: PageProps<"/p/[projectId]/leads">) {
  const { projectId } = await params;
  const { status } = await searchParams;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "leads")) return <NoAccess />;

  const activeStatus = typeof status === "string" ? status : "";
  const [leads, counts, keywords, publications] = await Promise.all([
    listLeads(ctx, activeStatus || undefined),
    leadCounts(ctx),
    listKeywords(ctx),
    publicationOptions(ctx),
  ]);
  const canEdit = can(ctx.role, "sales.manage");
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabs = [{ value: "", label: "Все", count: total }, ...LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label, count: counts[s.value] ?? 0 }))];

  return (
    <>
      <PageHeader
        title="Заявки"
        description="Входящие лиды: кто написал кодовое слово, откуда и с какого поста."
        actions={
          canEdit ? (
            <LeadCreateButton
              projectId={projectId}
              today={todayDay()}
              keywords={keywords.map((k) => ({ id: k.id, label: k.word }))}
              publications={publications.map((p) => ({ id: p.id, label: `${p.date ? shortDay(dateToDay(p.date)) : ""} · ${p.title}` }))}
            />
          ) : undefined
        }
      />

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Статусы">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={`/p/${projectId}/leads${tab.value ? `?status=${tab.value}` : ""}`}
            aria-current={activeStatus === tab.value ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-sm", activeStatus === tab.value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {tab.label} <span className="tabular-nums opacity-70">{tab.count}</span>
          </Link>
        ))}
      </nav>

      {leads.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Заявок нет. Добавьте вручную кнопкой «Заявка» — например, человек написал кодовое слово в директ.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2 font-medium">Кто</th>
                <th className="p-2 font-medium">Слово</th>
                <th className="p-2 font-medium">Откуда</th>
                <th className="p-2 font-medium">Пост-источник</th>
                <th className="p-2 font-medium">Когда</th>
                {canEdit && <th className="p-2 text-right font-medium">Действия</th>}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t align-top">
                  <td className="p-2">
                    <div className="font-medium">{lead.source === "COMMENT" || lead.source === "DIRECT" ? `@${lead.handle}` : lead.handle}</div>
                    {lead.contact && <div className="text-xs text-muted-foreground">{lead.contact}</div>}
                    {lead.note && <div className="line-clamp-2 max-w-64 text-xs text-muted-foreground">{lead.note}</div>}
                  </td>
                  <td className="p-2 font-semibold tracking-wide">{lead.keyword?.word ?? "—"}</td>
                  <td className="p-2">{SOURCE_LABEL[lead.source]}</td>
                  <td className="max-w-56 p-2 text-xs">{lead.publication?.title ?? "—"}</td>
                  <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{lead.source === "COMMENT" ? formatDateTime(lead.firstTouchAt) : formatDate(lead.firstTouchAt)}</td>
                  {canEdit && (
                    <td className="p-2">
                      <LeadActions projectId={projectId} lead={{ id: lead.id, status: lead.status, clientId: lead.client?.id ?? null }} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
