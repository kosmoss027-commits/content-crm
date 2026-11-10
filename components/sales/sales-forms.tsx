"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, PlusIcon, Trash2Icon, UserCheckIcon } from "lucide-react";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/forms";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/config/sales";
import {
  addPaymentAction,
  convertLeadAction,
  createKeywordAction,
  createLeadAction,
  deleteClientAction,
  deleteLeadAction,
  deletePaymentAction,
  saveClientAction,
  updateKeywordAction,
  updateLeadAction,
  saveMagnetAction,
  deleteMagnetAction,
} from "@/app/(app)/p/[projectId]/sales-actions";


type Source = (typeof LEAD_SOURCES)[number]["value"];
type Option = { id: string; label: string };

const fieldClass = "h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const areaClass = "w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionState>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      notify(result);
      if (result?.ok) after?.();
    });
  return { pending, run };
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-1.5 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

// ─── Кодовые слова ───

export function KeywordForm({ projectId }: { projectId: string }) {
  const { pending, run } = useRun();
  const [word, setWord] = useState("");
  const [product, setProduct] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createKeywordAction(projectId, { word, product, note: "" }), () => {
          setWord("");
          setProduct("");
        });
      }}
    >
      <Field label="Слово" className="w-40">
        <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="ПУТЬ" maxLength={30} required />
      </Field>
      <Field label="К чему ведёт" className="min-w-56 flex-1">
        <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Наставничество / гайд «Как начать блог»" maxLength={200} />
      </Field>
      <Button type="submit" disabled={pending || !word.trim()}>
        <PlusIcon />
        Добавить
      </Button>
    </form>
  );
}

export function KeywordArchiveButton({ projectId, id, archived }: { projectId: string; id: string; archived: boolean }) {
  const { pending, run } = useRun();
  return (
    <Button
      size="icon"
      variant="ghost"
      disabled={pending}
      title={archived ? "Вернуть из архива" : "В архив"}
      aria-label={archived ? "Вернуть из архива" : "В архив"}
      onClick={() => run(() => updateKeywordAction(projectId, id, { archived: !archived }))}
    >
      {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
    </Button>
  );
}

// ─── Заявки ───

export function LeadCreateButton({ projectId, keywords, publications, today }: { projectId: string; keywords: Option[]; publications: Option[]; today: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const empty = { handle: "", contact: "", source: "DIRECT" as Source, keywordId: "", publicationId: "", note: "", date: today };
  const [form, setForm] = useState(empty);
  const set = <K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon />
        Заявка
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Новая заявка</DialogTitle>
            <DialogDescription>Из директа, Telegram или откуда угодно. Комментарии с кодовыми словами появятся сами, когда подключим Instagram.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ник или имя">
              <Input value={form.handle} onChange={(e) => set("handle", e.target.value)} placeholder="@ivan или Мария" maxLength={100} />
            </Field>
            <Field label="Откуда">
              <select className={fieldClass} value={form.source} onChange={(e) => set("source", e.target.value as Source)}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Кодовое слово">
              <select className={fieldClass} value={form.keywordId} onChange={(e) => set("keywordId", e.target.value)}>
                <option value="">— без слова —</option>
                {keywords.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Дата">
              <input type="date" className={fieldClass} value={form.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label="С какого поста" className="sm:col-span-2">
              <select className={fieldClass} value={form.publicationId} onChange={(e) => set("publicationId", e.target.value)}>
                <option value="">— не знаю —</option>
                {publications.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Контакт (телефон, ссылка)" className="sm:col-span-2">
              <Input value={form.contact} onChange={(e) => set("contact", e.target.value)} maxLength={200} />
            </Field>
            <Field label="Заметка" className="sm:col-span-2">
              <textarea className={areaClass} rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={2000} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Отмена
            </Button>
            <Button
              disabled={pending || !form.handle.trim()}
              onClick={() =>
                run(
                  () => createLeadAction(projectId, { ...form, keywordId: form.keywordId || null, publicationId: form.publicationId || null, date: form.date || null }),
                  () => {
                    setForm(empty);
                    setOpen(false);
                  },
                )
              }
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LeadActions({ projectId, lead }: { projectId: string; lead: { id: string; status: string; clientId: string | null } }) {
  const { pending, run } = useRun();
  const router = useRouter();
  return (
    <div className="flex items-center justify-end gap-1">
      <select
        aria-label="Статус заявки"
        className="h-8 rounded-md border bg-transparent px-2 text-sm"
        value={lead.status}
        disabled={pending}
        onChange={(e) => run(() => updateLeadAction(projectId, lead.id, { status: e.target.value }))}
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {lead.clientId ? (
        <Button size="sm" variant="ghost" onClick={() => router.push(`/p/${projectId}/clients/${lead.clientId}`)}>
          Карточка
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await convertLeadAction(projectId, lead.id);
              if (result.ok && result.clientId) router.push(`/p/${projectId}/clients/${result.clientId}`);
              return result;
            })
          }
        >
          <UserCheckIcon />
          Стал клиентом
        </Button>
      )}
      <Button size="icon" variant="ghost" disabled={pending} aria-label="Удалить заявку" onClick={() => confirm("Удалить заявку?") && run(() => deleteLeadAction(projectId, lead.id))}>
        <Trash2Icon />
      </Button>
    </div>
  );
}

// ─── Клиенты ───

export type ClientFormData = {
  name: string;
  phone: string;
  telegram: string;
  instagram: string;
  email: string;
  source: Source | null;
  keywordId: string | null;
  notes: string;
};

export const EMPTY_CLIENT: ClientFormData = { name: "", phone: "", telegram: "", instagram: "", email: "", source: null, keywordId: null, notes: "" };

export function ClientForm({ projectId, id, initial, keywords, onSaved }: { projectId: string; id: string | null; initial: ClientFormData; keywords: Option[]; onSaved?: () => void }) {
  const { pending, run } = useRun();
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const set = <K extends keyof ClientFormData>(key: K, value: ClientFormData[K]) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const result = await saveClientAction(projectId, id, form);
          if (result.ok && !id && result.clientId) router.push(`/p/${projectId}/clients/${result.clientId}`);
          if (result.ok) onSaved?.();
          return result;
        });
      }}
    >
      <Field label="Имя" className="sm:col-span-2">
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={100} required />
      </Field>
      <Field label="Телефон">
        <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} inputMode="tel" />
      </Field>
      <Field label="Telegram">
        <Input value={form.telegram} onChange={(e) => set("telegram", e.target.value)} maxLength={100} />
      </Field>
      <Field label="Instagram">
        <Input value={form.instagram} onChange={(e) => set("instagram", e.target.value)} maxLength={100} />
      </Field>
      <Field label="Email">
        <Input value={form.email} onChange={(e) => set("email", e.target.value)} maxLength={200} type="email" />
      </Field>
      <Field label="Источник">
        <select className={fieldClass} value={form.source ?? ""} onChange={(e) => set("source", (e.target.value || null) as Source | null)}>
          <option value="">—</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Кодовое слово">
        <select className={fieldClass} value={form.keywordId ?? ""} onChange={(e) => set("keywordId", e.target.value || null)}>
          <option value="">—</option>
          {keywords.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Заметки" className="sm:col-span-2">
        <textarea className={areaClass} rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={10000} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || !form.name.trim()}>
          {id ? "Сохранить" : "Добавить клиента"}
        </Button>
      </div>
    </form>
  );
}

export function ClientCreateButton({ projectId, keywords }: { projectId: string; keywords: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon />
        Клиент
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый клиент</DialogTitle>
            <DialogDescription>Обычно клиент появляется из заявки кнопкой «Стал клиентом». Здесь — если пришёл без заявки.</DialogDescription>
          </DialogHeader>
          <ClientForm projectId={projectId} id={null} initial={EMPTY_CLIENT} keywords={keywords} onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteClientButton({ projectId, id }: { projectId: string; id: string }) {
  const { pending, run } = useRun();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => confirm("Удалить клиента вместе с его оплатами?") && run(() => deleteClientAction(projectId, id), () => router.push(`/p/${projectId}/clients`))}
    >
      <Trash2Icon />
      Удалить клиента
    </Button>
  );
}

// ─── Оплаты ───

export function PaymentForm({ projectId, clientId, today }: { projectId: string; clientId: string; today: string }) {
  const { pending, run } = useRun();
  const empty = { amount: "", product: "", paidAt: today, note: "" };
  const [form, setForm] = useState(empty);
  const amount = Number(form.amount.replace(/\s/g, ""));
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!Number.isInteger(amount) || amount <= 0) {
          notify({ ok: false, message: "Сумма — целое число рублей, без копеек" });
          return;
        }
        run(() => addPaymentAction(projectId, clientId, { amountRub: amount, product: form.product, paidAt: form.paidAt, note: form.note }), () => setForm(empty));
      }}
    >
      <Field label="Сумма, ₽" className="w-32">
        <Input inputMode="numeric" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="15000" required />
      </Field>
      <Field label="За что" className="min-w-40 flex-1">
        <Input value={form.product} onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))} placeholder="Наставничество" maxLength={200} />
      </Field>
      <Field label="Дата" className="w-40">
        <input type="date" className={fieldClass} value={form.paidAt} onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))} required />
      </Field>
      <Button type="submit" disabled={pending}>
        <PlusIcon />
        Оплата
      </Button>
    </form>
  );
}

export function DeletePaymentButton({ projectId, id }: { projectId: string; id: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="icon" variant="ghost" disabled={pending} aria-label="Удалить оплату" onClick={() => confirm("Удалить запись об оплате?") && run(() => deletePaymentAction(projectId, id))}>
      <Trash2Icon />
    </Button>
  );
}

// ─── ЛМ-воронка ───

export type MagnetFormData = { name: string; description: string; url: string; keywordId: string | null };

export function MagnetForm({ projectId, id, initial, keywords, onSaved }: { projectId: string; id: string | null; initial: MagnetFormData; keywords: Option[]; onSaved?: () => void }) {
  const { pending, run } = useRun();
  const [form, setForm] = useState(initial);
  const set = <K extends keyof MagnetFormData>(key: K, value: MagnetFormData[K]) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveMagnetAction(projectId, id, form), () => {
          if (!id) setForm(initial);
          onSaved?.();
        });
      }}
    >
      <Field label="Название">
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Гайд «Как начать блог за 7 дней»" maxLength={120} required />
      </Field>
      <Field label="Кодовое слово, по которому выдаёте">
        <select className={fieldClass} value={form.keywordId ?? ""} onChange={(e) => set("keywordId", e.target.value || null)}>
          <option value="">—</option>
          {keywords.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ссылка на лид-магнит" className="sm:col-span-2">
        <Input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" maxLength={500} />
      </Field>
      <Field label="Описание" className="sm:col-span-2">
        <textarea className={areaClass} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={1000} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || !form.name.trim()}>
          {id ? "Сохранить" : "Добавить лид-магнит"}
        </Button>
      </div>
    </form>
  );
}

export function MagnetRowActions({ projectId, magnet }: { projectId: string; magnet: { id: string; archived: boolean; data: MagnetFormData } }) {
  const { pending, run } = useRun();
  return (
    <div className="flex justify-end gap-1">
      <Button
        size="icon"
        variant="ghost"
        disabled={pending}
        title={magnet.archived ? "Вернуть из архива" : "В архив"}
        aria-label={magnet.archived ? "Вернуть из архива" : "В архив"}
        onClick={() => run(() => saveMagnetAction(projectId, magnet.id, { ...magnet.data, archived: !magnet.archived }))}
      >
        {magnet.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
      </Button>
      <Button size="icon" variant="ghost" disabled={pending} aria-label="Удалить лид-магнит" onClick={() => confirm("Удалить лид-магнит?") && run(() => deleteMagnetAction(projectId, magnet.id))}>
        <Trash2Icon />
      </Button>
    </div>
  );
}
