"use client";

import { useState, useTransition } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/config/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/forms";
import { addExpenseAction, deleteExpenseAction } from "@/app/(app)/p/[projectId]/work-actions";

const fieldClass = "h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function ExpenseForm({ projectId, defaultDate }: { projectId: string; defaultDate: string }) {
  const [pending, startTransition] = useTransition();
  const empty = { amount: "", category: EXPENSE_CATEGORIES[0] as (typeof EXPENSE_CATEGORIES)[number], note: "", spentAt: defaultDate };
  const [form, setForm] = useState(empty);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const amountRub = Number(form.amount.replace(/\s/g, ""));
        if (!Number.isInteger(amountRub) || amountRub <= 0) {
          notify({ ok: false, message: "Сумма — целое число рублей" });
          return;
        }
        startTransition(async () => {
          const result = await addExpenseAction(projectId, { amountRub, category: form.category, note: form.note, spentAt: form.spentAt });
          notify(result);
          if (result?.ok) setForm({ ...empty, category: form.category, spentAt: form.spentAt });
        });
      }}
    >
      <label className="grid w-32 gap-1.5 text-sm">
        <span className="font-medium">Сумма, ₽</span>
        <Input inputMode="numeric" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="5000" required />
      </label>
      <label className="grid w-48 gap-1.5 text-sm">
        <span className="font-medium">Категория</span>
        <select className={fieldClass} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as typeof f.category }))}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="grid min-w-40 flex-1 gap-1.5 text-sm">
        <span className="font-medium">На что</span>
        <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Таргет на ролик про путь" maxLength={500} />
      </label>
      <label className="grid w-40 gap-1.5 text-sm">
        <span className="font-medium">Дата</span>
        <input type="date" className={fieldClass} value={form.spentAt} onChange={(e) => setForm((f) => ({ ...f, spentAt: e.target.value }))} required />
      </label>
      <Button type="submit" disabled={pending}>
        <PlusIcon />
        Расход
      </Button>
    </form>
  );
}

export function DeleteExpenseButton({ projectId, id }: { projectId: string; id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7"
      disabled={pending}
      aria-label="Удалить расход"
      onClick={() => confirm("Удалить расход?") && startTransition(async () => notify(await deleteExpenseAction(projectId, id)))}
    >
      <Trash2Icon />
    </Button>
  );
}
