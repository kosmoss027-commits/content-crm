"use client";

import { useState, useTransition } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/forms";
import { deleteTaskAction, saveTaskAction, setTaskStatusAction } from "@/app/(app)/p/[projectId]/work-actions";

type Option = { id: string; label: string };
const fieldClass = "h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export type TaskFormData = { title: string; note: string; dueDate: string | null; assigneeId: string | null; publicationId: string | null; clientId: string | null; reelId: string | null };

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-1.5 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function OptionSelect({ value, options, onChange, empty }: { value: string | null; options: Option[]; onChange: (v: string | null) => void; empty: string }) {
  return (
    <select className={fieldClass} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Новая задача или правка существующей. */
export function TaskDialog({
  projectId,
  id,
  initial,
  members,
  publications,
  clients,
  open,
  onOpenChange,
}: {
  projectId: string;
  id: string | null;
  initial: TaskFormData;
  members: Option[];
  publications: Option[];
  /** Пусто, если роли не положено видеть клиентов */
  clients: Option[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{id ? "Задача" : "Новая задача"}</DialogTitle>
          <DialogDescription>Срок, исполнитель и к чему относится.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Что сделать" className="sm:col-span-2">
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} placeholder="Снять ролик про первый клиент" />
          </Field>
          <Field label="Срок">
            <input type="date" className={fieldClass} value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value || null)} />
          </Field>
          <Field label="Исполнитель">
            <OptionSelect value={form.assigneeId} options={members} onChange={(v) => set("assigneeId", v)} empty="— никто —" />
          </Field>
          {publications.length > 0 && (
            <Field label="Публикация" className="sm:col-span-2">
              <OptionSelect value={form.publicationId} options={publications} onChange={(v) => set("publicationId", v)} empty="—" />
            </Field>
          )}
          {clients.length > 0 && (
            <Field label="Клиент" className="sm:col-span-2">
              <OptionSelect value={form.clientId} options={clients} onChange={(v) => set("clientId", v)} empty="—" />
            </Field>
          )}
          <Field label="Заметка" className="sm:col-span-2">
            <textarea className="w-full rounded-md border bg-transparent px-3 py-2 text-sm" rows={3} value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={5000} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={pending || !form.title.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await saveTaskAction(projectId, id, form);
                notify(result);
                if (result?.ok) onOpenChange(false);
              })
            }
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskCreateButton(props: { projectId: string; members: Option[]; publications: Option[]; clients: Option[]; defaultAssigneeId: string; today: string; initial?: Partial<TaskFormData> }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <PlusIcon />
        Задача
      </Button>
      {open && (
        <TaskDialog
          key={key}
          {...props}
          id={null}
          open
          onOpenChange={setOpen}
          initial={{ title: "", note: "", dueDate: props.today, assigneeId: props.defaultAssigneeId, publicationId: null, clientId: null, reelId: null, ...props.initial }}
        />
      )}
    </>
  );
}

export type TaskItemData = TaskFormData & { id: string; status: string; dueLabel: string | null; overdue: boolean; assigneeName: string | null; links: { label: string; href: string }[] };

/** Строка задачи: галочка «готово», открыть для правки, удалить. */
export function TaskItem({ projectId, task, members, publications, clients, compact = false }: { projectId: string; task: TaskItemData; members: Option[]; publications: Option[]; clients: Option[]; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const done = task.status === "DONE";
  const run = (fn: () => Promise<ActionState>) => startTransition(async () => notify(await fn()));
  return (
    <li className={cn("flex items-start gap-2 rounded-lg border px-2 py-1.5 text-sm", pending && "opacity-60")}>
      <input
        type="checkbox"
        className="mt-1"
        aria-label={done ? "Вернуть в работу" : "Отметить сделанной"}
        checked={done}
        disabled={pending}
        onChange={() => run(() => setTaskStatusAction(projectId, task.id, done ? "TODO" : "DONE"))}
      />
      <button type="button" className="grid flex-1 gap-0.5 text-left" onClick={() => setEditing(true)}>
        <span className={cn("font-medium", done && "text-muted-foreground line-through")}>{task.title}</span>
        <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {task.dueLabel && <span className={cn(task.overdue && !done && "font-medium text-destructive")}>{task.dueLabel}</span>}
          {!compact && task.assigneeName && <span>→ {task.assigneeName}</span>}
          {!compact && task.links.map((l) => <span key={l.href}>{l.label}</span>)}
          {task.status === "IN_PROGRESS" && <span>в работе</span>}
        </span>
      </button>
      {!compact && (
        <Button size="icon" variant="ghost" className="size-7" disabled={pending} aria-label="Удалить задачу" onClick={() => confirm("Удалить задачу?") && run(() => deleteTaskAction(projectId, task.id))}>
          <Trash2Icon />
        </Button>
      )}
      {editing && (
        <TaskDialog projectId={projectId} id={task.id} initial={task} members={members} publications={publications} clients={clients} open onOpenChange={setEditing} />
      )}
    </li>
  );
}
