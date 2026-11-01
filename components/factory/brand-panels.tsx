"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { ExternalLinkIcon, Trash2Icon } from "lucide-react";
import type { HypothesisStatus } from "@/lib/generated/prisma/enums";
import type { ActionState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, notify, SubmitButton, useActionToast } from "@/components/forms";
import {
  addTechniqueAction,
  createHypothesisAction,
  deleteHypothesisAction,
  removeTechniqueAction,
  saveBrandAction,
  setHypothesisStatusAction,
} from "@/app/(app)/p/[projectId]/factory-actions";

const areaClass = "min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export type BrandValues = Record<
  "author" | "niche" | "audience" | "products" | "tone" | "forbidden" | "examples" | "topics" | "keywords" | "exclusions" | "scriptTemplate",
  string
> & { relevanceThreshold: number };

function Area({ name, label, hint, value, rows = 2 }: { name: string; label: string; hint?: string; value: string; rows?: number }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <textarea id={name} name={name} defaultValue={value} rows={rows} className={areaClass} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function BrandForm({ projectId, values, canEdit }: { projectId: string; values: BrandValues; canEdit: boolean }) {
  const [state, action] = useActionState(saveBrandAction.bind(null, projectId), null);
  useActionToast(state);

  return (
    <form action={action} className="grid gap-8">
      <fieldset disabled={!canEdit} className="grid gap-4">
        <legend className="mb-2 font-medium">Карта бренда</legend>
        <Area name="author" label="Кто автор" value={values.author} hint="Опыт, история, чем отличается от других" />
        <Area name="niche" label="Ниша" value={values.niche} rows={1} />
        <Area name="audience" label="Аудитория" value={values.audience} hint="Кто смотрит, их боли и желания" />
        <Area name="products" label="Продукты и цены" value={values.products} />
        <Area name="tone" label="Тон" value={values.tone} hint="Например: на «ты», с юмором, без канцелярита" />
        <Area name="forbidden" label="Запретные слова и конструкции" value={values.forbidden} />
        <Area name="examples" label="Примеры удачных сценариев" value={values.examples} rows={5} />
      </fieldset>

      <fieldset disabled={!canEdit} className="grid gap-4">
        <legend className="mb-2 font-medium">Профиль поиска</legend>
        <p className="-mt-2 text-sm text-muted-foreground">По нему Claude отсеивает чужие залёты, которые не подходят проекту, — на них не тратятся деньги на разбор.</p>
        <Area name="topics" label="Нужные темы" value={values.topics} hint="Например: сценарии reels, хуки, прогревы, воронки, личный бренд" />
        <Area name="keywords" label="Ключевые слова (рус. и англ.)" value={values.keywords} />
        <Area name="exclusions" label="Не нужно" value={values.exclusions} hint="Например: розыгрыши, накрутка, мемы без пользы" />
        <div className="w-48">
          <Field
            label="Порог пользы (0–10)"
            name="relevanceThreshold"
            type="number"
            min={0}
            max={10}
            defaultValue={values.relevanceThreshold}
          />
        </div>
      </fieldset>

      <fieldset disabled={!canEdit} className="grid gap-4">
        <legend className="mb-2 font-medium">Шаблон сценария</legend>
        <Area
          name="scriptTemplate"
          label="Как вы пишете сценарии"
          value={values.scriptTemplate}
          rows={6}
          hint="Структура, длина, обязательные элементы. Пусто — Claude пишет по схеме хук → кадры → финал."
        />
      </fieldset>

      {canEdit && <SubmitButton className="w-fit">Сохранить карту бренда</SubmitButton>}
    </form>
  );
}

export type TechniqueView = { id: string; title: string; description: string; exampleUrl: string | null };

export function TechniquesPanel({ projectId, techniques, canEdit }: { projectId: string; techniques: TechniqueView[]; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const run = (fn: () => Promise<ActionState>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      notify(result);
      if (result?.ok) after?.();
    });

  return (
    <section className="grid gap-3">
      <h2 className="font-medium">Банк приёмов · {techniques.length}</h2>
      {canEdit && (
        <form
          ref={formRef}
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(
              () => addTechniqueAction(projectId, { title: String(data.get("title")), description: String(data.get("description")), exampleUrl: String(data.get("exampleUrl")) }),
              () => formRef.current?.reset(),
            );
          }}
        >
          <Input name="title" placeholder="Приём: текст на экране с цифрой" required maxLength={120} className="h-8 min-w-48 flex-1" aria-label="Название приёма" />
          <Input name="description" placeholder="Как применять" maxLength={1000} className="h-8 min-w-48 flex-1" aria-label="Описание приёма" />
          <Input name="exampleUrl" placeholder="Ссылка-пример" className="h-8 w-56" aria-label="Ссылка-пример" />
          <Button size="sm" type="submit" disabled={pending}>
            Добавить
          </Button>
        </form>
      )}
      {techniques.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-6 text-center text-sm text-muted-foreground">
          Пока пусто. Приёмы сохраняются из разборов роликов (значок закладки) или вручную.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {techniques.map((t) => (
            <li key={t.id} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="font-medium">{t.title}</span>
                {t.description && <span className="text-xs text-muted-foreground">{t.description}</span>}
                {t.exampleUrl && (
                  <a href={t.exampleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                    пример <ExternalLinkIcon className="size-3" />
                  </a>
                )}
              </div>
              {canEdit && (
                <Button size="icon" variant="ghost" className="size-7" disabled={pending} aria-label={`Удалить приём ${t.title}`} onClick={() => run(() => removeTechniqueAction(projectId, t.id))}>
                  <Trash2Icon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const HYPOTHESIS_LABELS: Record<HypothesisStatus, string> = { TESTING: "Проверяем", CONFIRMED: "Подтвердилась", REJECTED: "Не подтвердилась" };

export type HypothesisView = { id: string; text: string; note: string; status: HypothesisStatus; reels: { id: string; url: string; label: string }[] };

export function HypothesesPanel({ projectId, hypotheses, canEdit }: { projectId: string; hypotheses: HypothesisView[]; canEdit: boolean }) {
  const [state, action] = useActionState(createHypothesisAction.bind(null, projectId), null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  const run = (fn: () => Promise<ActionState>) => startTransition(async () => notify(await fn()));

  return (
    <div className="grid gap-4">
      {canEdit && (
        <form ref={formRef} action={action} className="grid gap-2 rounded-xl border p-4">
          <Field label="Гипотеза" name="text" placeholder="Хук с цифрой в первой секунде даёт больше досмотра" required maxLength={500} />
          <Field label="Как проверяем (необязательно)" name="note" maxLength={2000} />
          <SubmitButton size="sm" className="w-fit">
            Добавить гипотезу
          </SubmitButton>
          <p className="text-xs text-muted-foreground">Ролики-референсы привязываются из разбора ролика. Свои публикации — с этапа 4.</p>
        </form>
      )}
      {hypotheses.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">Гипотез пока нет.</p>
      ) : (
        <ul className="grid gap-2">
          {hypotheses.map((h) => (
            <li key={h.id} className="grid gap-2 rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">{h.text}</span>
                  {h.note && <span className="text-xs text-muted-foreground">{h.note}</span>}
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-1">
                    <Select value={h.status} onValueChange={(status) => run(() => setHypothesisStatusAction(projectId, h.id, status as HypothesisStatus))}>
                      <SelectTrigger className="h-8 w-44" aria-label="Статус гипотезы">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(HYPOTHESIS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" disabled={pending} aria-label="Удалить гипотезу" onClick={() => confirm("Удалить гипотезу?") && run(() => deleteHypothesisAction(projectId, h.id))}>
                      <Trash2Icon />
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs">{HYPOTHESIS_LABELS[h.status]}</span>
                )}
              </div>
              {h.reels.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  Референсы:
                  {h.reels.map((r) => (
                    <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {r.label}
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
