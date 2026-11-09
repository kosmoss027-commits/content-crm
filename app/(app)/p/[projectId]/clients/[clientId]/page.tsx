import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireProjectContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/navigation";
import { dateToDay, shortDay, todayDay } from "@/lib/content/dates";
import { getClient, listKeywords } from "@/lib/db/sales";
import { formatDate, formatDateTime, formatRub } from "@/lib/format";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { SOURCE_LABEL } from "@/config/sales";
import { ClientForm, DeleteClientButton, DeletePaymentButton, PaymentForm } from "@/components/sales/sales-forms";

export const metadata = { title: "Клиент — Content CRM" };


export default async function ClientPage({ params }: PageProps<"/p/[projectId]/clients/[clientId]">) {
  const { projectId, clientId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "clients")) return <NoAccess />;

  const [client, keywords] = await Promise.all([getClient(ctx, clientId), listKeywords(ctx, true)]);
  const canEdit = can(ctx.role, "sales.manage");
  const revenue = client.payments.reduce((sum, p) => sum + p.amountRub, 0);

  // История: заявки, переход в клиенты, оплаты — по времени
  const history = [
    ...client.leads.map((lead) => ({
      at: lead.firstTouchAt,
      dateOnly: lead.source !== "COMMENT",
      text: `Заявка: ${SOURCE_LABEL[lead.source].toLowerCase()}${lead.keyword ? `, слово ${lead.keyword.word}` : ""}${lead.publication ? `, пост «${lead.publication.title}»` : ""}`,
    })),
    { at: client.createdAt, dateOnly: false, text: "Стал клиентом" },
    ...client.payments.map((p) => ({ at: p.paidAt, dateOnly: true, text: `Оплата ${formatRub(p.amountRub)}${p.product ? ` — ${p.product}` : ""}` })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <>
      <Link href={`/p/${projectId}/clients`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeftIcon className="size-3.5" /> Все клиенты
      </Link>
      <PageHeader
        title={client.name}
        description={`${client.source ? SOURCE_LABEL[client.source] : "Источник не указан"}${client.keyword ? ` · слово ${client.keyword.word}` : ""} · оплат ${client.payments.length} на ${formatRub(revenue)}`}
        actions={canEdit ? <DeleteClientButton projectId={projectId} id={client.id} /> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-6">
          <section className="grid gap-3">
            <h2 className="font-medium">Оплаты</h2>
            {canEdit && <PaymentForm projectId={projectId} clientId={client.id} today={todayDay()} />}
            {client.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Оплат пока нет. Деньги через сайт не идут — запишите сумму после перевода, чтобы видеть выручку по кодовым словам.</p>
            ) : (
              <ul className="divide-y rounded-xl border text-sm">
                {client.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-20 text-xs text-muted-foreground tabular-nums">{shortDay(dateToDay(p.paidAt))}</span>
                    <span className="flex-1">{p.product || "—"}</span>
                    <span className="font-medium tabular-nums">{formatRub(p.amountRub)}</span>
                    {canEdit && <DeletePaymentButton projectId={projectId} id={p.id} />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-3">
            <h2 className="font-medium">Контакты и заметки</h2>
            {canEdit ? (
              <ClientForm
                projectId={projectId}
                id={client.id}
                keywords={keywords.map((k) => ({ id: k.id, label: k.word }))}
                initial={{
                  name: client.name,
                  phone: client.phone,
                  telegram: client.telegram,
                  instagram: client.instagram,
                  email: client.email,
                  source: client.source,
                  keywordId: client.keyword?.id ?? null,
                  notes: client.notes,
                }}
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{client.notes || "—"}</p>
            )}
          </section>
        </div>

        <section className="grid content-start gap-2">
          <h2 className="font-medium">История</h2>
          <ol className="grid gap-2 border-l pl-4 text-sm">
            {history.map((event, i) => (
              <li key={i} className="relative">
                <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-foreground/40" aria-hidden />
                <p>{event.text}</p>
                <p className="text-xs text-muted-foreground">{event.dateOnly ? formatDate(event.at) : formatDateTime(event.at)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
