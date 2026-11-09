"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { WarmupDayKind } from "@/lib/generated/prisma/enums";
import { DAY_KINDS, MEANINGS } from "@/config/warmups";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/forms";
import { deleteCampaignAction, saveCampaignAction, saveWarmupDayAction } from "@/app/(app)/p/[projectId]/work-actions";

const fieldClass = "h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const cellClass = "w-full rounded border bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export type CampaignFormData = { name: string; product: string; startDate: string; endDate: string; salesStartDate: string | null; note: string };

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-1.5 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function CampaignForm({ projectId, id, initial, onSaved }: { projectId: string; id: string | null; initial: CampaignFormData; onSaved?: () => void }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const set = <K extends keyof CampaignFormData>(key: K, value: CampaignFormData[K]) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await saveCampaignAction(projectId, id, form);
          notify(result);
          if (!result?.ok) return;
          onSaved?.();
          if (!id && result.campaignId) router.push(`/p/${projectId}/warmups/${result.campaignId}`);
        });
      }}
    >
      <Field label="Название" className="sm:col-span-2">
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Прогрев к наставничеству, декабрь" maxLength={120} required />
      </Field>
      <Field label="Продукт" className="sm:col-span-2">
        <Input value={form.product} onChange={(e) => set("product", e.target.value)} placeholder="Наставничество" maxLength={200} />
      </Field>
      <Field label="Начало">
        <input type="date" className={fieldClass} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} required />
      </Field>
      <Field label="Конец">
        <input type="date" className={fieldClass} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} required />
      </Field>
      <Field label="Старт продаж">
        <input type="date" className={fieldClass} value={form.salesStartDate ?? ""} onChange={(e) => set("salesStartDate", e.target.value || null)} />
      </Field>
      <Field label="Заметка" className="sm:col-span-2">
        <textarea className="w-full rounded-md border bg-transparent px-3 py-2 text-sm" rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={5000} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || !form.name.trim()}>
          {id ? "Сохранить" : "Создать прогрев"}
        </Button>
      </div>
    </form>
  );
}

export function CampaignCreateButton({ projectId, today, inMonth }: { projectId: string; today: string; inMonth: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon />
        Прогрев
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый прогрев</DialogTitle>
            <DialogDescription>Период, продукт и дата старта продаж. Дни и смыслы распишете в таблице кампании.</DialogDescription>
          </DialogHeader>
          <CampaignForm projectId={projectId} id={null} initial={{ name: "", product: "", startDate: today, endDate: inMonth, salesStartDate: null, note: "" }} onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteCampaignButton({ projectId, id }: { projectId: string; id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        confirm("Удалить прогрев? Публикации в контент-плане останутся, только отвяжутся от него.") &&
        startTransition(async () => {
          const result = await deleteCampaignAction(projectId, id);
          notify(result);
          if (result?.ok) router.push(`/p/${projectId}/warmups`);
        })
      }
    >
      <Trash2Icon />
      Удалить
    </Button>
  );
}

export type DayRowData = { kind: WarmupDayKind | null; meaning: string; telegramPost: string; stories: string; meanings: string[] };

function cell(enabled: boolean) {
  return cn(cellClass, !enabled && "border-transparent");
}

/** Строка таблицы «по дням»: сохраняется сама, когда уходите из поля. */
export function WarmupDayRow({ projectId, campaignId, day, label, initial, canEdit }: { projectId: string; campaignId: string; day: string; label: string; initial: DayRowData; canEdit: boolean }) {
  const [row, setRow] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const kind = DAY_KINDS.find((k) => k.value === row.kind);

  const save = (next: DayRowData) => {
    if (JSON.stringify(next) === JSON.stringify(saved)) return;
    startTransition(async () => {
      const result: ActionState = await saveWarmupDayAction(projectId, campaignId, day, next);
      if (result?.ok) setSaved(next);
      else notify(result);
    });
  };

  return (
    <tr id={`day-${day}`} className={cn("scroll-mt-20 border-t align-top", pending && "opacity-60")}>
      <td className="p-2 text-xs whitespace-nowrap">
        <span className="font-medium">{label}</span>
        {kind && <span className={cn("mt-1 block w-fit rounded px-1.5 py-0.5 text-[10px]", kind.className)}>{kind.label}</span>}
      </td>
      <td className="w-40 p-1">
        <select
          aria-label={`Тип дня ${label}`}
          className={cell(canEdit)}
          disabled={!canEdit}
          value={row.kind ?? ""}
          onChange={(e) => {
            const next = { ...row, kind: (e.target.value || null) as WarmupDayKind | null };
            setRow(next);
            save(next);
          }}
        >
          <option value="">—</option>
          {DAY_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          aria-label={`Значение дня ${label}`}
          className={cn(cell(canEdit), "mt-1")}
          disabled={!canEdit}
          placeholder="значение дня"
          value={row.meaning}
          maxLength={500}
          onChange={(e) => setRow({ ...row, meaning: e.target.value })}
          onBlur={() => save(row)}
        />
      </td>
      <td className="p-1">
        <textarea
          aria-label={`Пост в Telegram ${label}`}
          className={cell(canEdit)}
          disabled={!canEdit}
          rows={2}
          value={row.telegramPost}
          maxLength={2000}
          onChange={(e) => setRow({ ...row, telegramPost: e.target.value })}
          onBlur={() => save(row)}
        />
      </td>
      <td className="p-1">
        <textarea
          aria-label={`Сторис ${label}`}
          className={cell(canEdit)}
          disabled={!canEdit}
          rows={2}
          value={row.stories}
          maxLength={2000}
          onChange={(e) => setRow({ ...row, stories: e.target.value })}
          onBlur={() => save(row)}
        />
      </td>
      <td className="w-44 p-1">
        <div className="grid gap-0.5 text-[11px]" role="group" aria-label={`Смыслы ${label}`}>
          {MEANINGS.map((m) => (
            <label key={m.value} className="flex items-center gap-1">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={row.meanings.includes(m.value)}
                onChange={(e) => {
                  const next = { ...row, meanings: e.target.checked ? [...row.meanings, m.value] : row.meanings.filter((v) => v !== m.value) };
                  setRow(next);
                  save(next);
                }}
              />
              {m.label}
            </label>
          ))}
        </div>
      </td>
    </tr>
  );
}
