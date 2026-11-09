import Link from "next/link";
import { requireProjectContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/navigation";
import { dateToDay, shortDay } from "@/lib/content/dates";
import { listClients, listKeywords } from "@/lib/db/sales";
import { formatRub } from "@/lib/format";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { SOURCE_LABEL } from "@/config/sales";
import { ClientCreateButton } from "@/components/sales/sales-forms";

export const metadata = { title: "Клиенты — Content CRM" };


export default async function ClientsPage({ params }: PageProps<"/p/[projectId]/clients">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "clients")) return <NoAccess />;

  const [clients, keywords] = await Promise.all([listClients(ctx), listKeywords(ctx)]);
  const revenue = clients.reduce((sum, c) => sum + c.revenueRub, 0);

  return (
    <>
      <PageHeader
        title="Клиенты"
        description={clients.length ? `${clients.length} клиент(ов), выручка за всё время ${formatRub(revenue)}` : "Контакты, источник, кодовое слово, оплаты и заметки."}
        actions={can(ctx.role, "sales.manage") ? <ClientCreateButton projectId={projectId} keywords={keywords.map((k) => ({ id: k.id, label: k.word }))} /> : undefined}
      />
      {clients.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Клиентов пока нет. Они появляются из заявок кнопкой «Стал клиентом».</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2 font-medium">Клиент</th>
                <th className="p-2 font-medium">Источник</th>
                <th className="p-2 font-medium">Слово</th>
                <th className="p-2 text-right font-medium">Оплат</th>
                <th className="p-2 text-right font-medium">Сумма</th>
                <th className="p-2 font-medium">Последняя оплата</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-t hover:bg-muted/40">
                  <td className="p-2">
                    <Link href={`/p/${projectId}/clients/${client.id}`} className="font-medium hover:underline">
                      {client.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{[client.phone, client.telegram && `tg: ${client.telegram}`].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="p-2">{client.source ? SOURCE_LABEL[client.source] : "—"}</td>
                  <td className="p-2 font-semibold tracking-wide">{client.keyword?.word ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{client.paymentsCount}</td>
                  <td className="p-2 text-right font-medium tabular-nums">{client.revenueRub ? formatRub(client.revenueRub) : "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{client.lastPaidAt ? shortDay(dateToDay(client.lastPaidAt)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
