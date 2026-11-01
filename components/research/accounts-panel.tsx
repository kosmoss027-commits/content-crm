"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { PauseIcon, PlayIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import type { Market, WatchStatus } from "@/lib/generated/prisma/enums";
import type { ActionState } from "@/lib/actions";
import { formatCount, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notify, SubmitButton, useActionToast } from "@/components/forms";
import {
  addAccountsAction,
  collectNowAction,
  removeEntryAction,
  updateEntryAction,
} from "@/app/(app)/p/[projectId]/research/actions";

export type AccountRow = {
  entryId: string;
  status: WatchStatus;
  market: Market;
  niche: string | null;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  followers: number | null;
  medianViews: number | null;
  reelsCount: number;
  viralCount: number;
  rating: number | null;
  lastScrapedAt: string | null;
  lastError: string | null;
};

const STATUS_LABELS: Record<WatchStatus, string> = { WATCHING: "Отслеживаем", PAUSED: "Пауза", CANDIDATE: "Кандидат" };
const MARKET_LABELS: Record<Market, string> = { CIS: "СНГ", FOREIGN: "Зарубеж" };

export function AddAccountsForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(addAccountsAction.bind(null, projectId), null);
  const formRef = useRef<HTMLFormElement>(null);
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-3 rounded-xl border p-4">
      <div className="grid gap-1.5">
        <Label htmlFor="usernames">Добавить аккаунты</Label>
        <textarea
          id="usernames"
          name="usernames"
          required
          rows={3}
          placeholder={"hormozi\n@k.gadzhiev_\nhttps://www.instagram.com/peter.visuals/"}
          className="min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">
          Ники или ссылки, по одному в строке или через запятую. По новым аккаунтам сразу соберутся последние 40 роликов
          для медианы.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select name="market" defaultValue="CIS">
          <SelectTrigger className="h-8 w-32" aria-label="Рынок">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CIS">СНГ</SelectItem>
            <SelectItem value="FOREIGN">Зарубеж</SelectItem>
          </SelectContent>
        </Select>
        <SubmitButton size="sm">Добавить и собрать</SubmitButton>
      </div>
    </form>
  );
}

function NicheInput({ projectId, row }: { projectId: string; row: AccountRow }) {
  const [, startTransition] = useTransition();
  return (
    <Input
      defaultValue={row.niche ?? ""}
      placeholder="ниша"
      maxLength={40}
      className="h-7 w-28 text-xs"
      aria-label={`Ниша @${row.username}`}
      onBlur={(event) => {
        const niche = event.target.value.trim();
        if (niche === (row.niche ?? "")) return;
        startTransition(async () => {
          const result = await updateEntryAction(projectId, row.entryId, { niche: niche || null });
          if (!result?.ok) notify(result);
        });
      }}
    />
  );
}

export function AccountsTable({ projectId, rows, canManage }: { projectId: string; rows: AccountRow[]; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionState>) => startTransition(async () => notify(await fn()));

  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">Пока ни одного аккаунта. Добавьте первые выше.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Аккаунт</TableHead>
            <TableHead className="text-right">Подписчики</TableHead>
            <TableHead className="text-right">Медиана</TableHead>
            <TableHead className="text-right">Роликов</TableHead>
            <TableHead className="text-right">Залётов</TableHead>
            <TableHead className="text-right">Рейтинг</TableHead>
            <TableHead>Рынок · ниша</TableHead>
            <TableHead>Сбор</TableHead>
            {canManage && <TableHead className="w-28" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.entryId} className={row.status !== "WATCHING" ? "opacity-60" : undefined}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {row.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full object-cover" />
                  ) : (
                    <span className="size-7 rounded-full bg-muted" />
                  )}
                  <div className="grid min-w-0">
                    <a href={`https://www.instagram.com/${row.username}/`} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
                      @{row.username}
                    </a>
                    <span className="truncate text-xs text-muted-foreground">{row.fullName ?? STATUS_LABELS[row.status]}</span>
                  </div>
                  {row.status !== "WATCHING" && <Badge variant="outline">{STATUS_LABELS[row.status]}</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCount(row.followers)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCount(row.medianViews)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.reelsCount}</TableCell>
              <TableCell className="text-right tabular-nums">{row.viralCount}</TableCell>
              <TableCell className="text-right tabular-nums">{row.rating ?? "—"}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {canManage ? (
                    <>
                      <Select
                        defaultValue={row.market}
                        onValueChange={(market) => run(() => updateEntryAction(projectId, row.entryId, { market: market as Market }))}
                      >
                        <SelectTrigger className="h-7 w-24 text-xs" aria-label="Рынок">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CIS">СНГ</SelectItem>
                          <SelectItem value="FOREIGN">Зарубеж</SelectItem>
                        </SelectContent>
                      </Select>
                      <NicheInput projectId={projectId} row={row} />
                    </>
                  ) : (
                    <span className="text-xs">
                      {MARKET_LABELS[row.market]}
                      {row.niche ? ` · ${row.niche}` : ""}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs">
                {row.lastError ? (
                  <span className="text-destructive" title={row.lastError}>
                    Ошибка: {row.lastError.slice(0, 40)}
                  </span>
                ) : row.lastScrapedAt ? (
                  <span className="text-muted-foreground">{formatDateTime(new Date(row.lastScrapedAt))}</span>
                ) : (
                  <span className="text-muted-foreground">ещё не собирали</span>
                )}
              </TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex justify-end gap-0.5">
                    <Button size="icon" variant="ghost" disabled={pending} title="Собрать сейчас" aria-label={`Собрать @${row.username}`} onClick={() => run(() => collectNowAction(projectId, row.entryId))}>
                      <RefreshCwIcon />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={pending}
                      title={row.status === "WATCHING" ? "Пауза" : "Отслеживать"}
                      aria-label={row.status === "WATCHING" ? `Пауза @${row.username}` : `Отслеживать @${row.username}`}
                      onClick={() => run(() => updateEntryAction(projectId, row.entryId, { status: row.status === "WATCHING" ? "PAUSED" : "WATCHING" }))}
                    >
                      {row.status === "WATCHING" ? <PauseIcon /> : <PlayIcon />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={pending}
                      title="Убрать"
                      aria-label={`Убрать @${row.username}`}
                      onClick={() => {
                        if (confirm(`Убрать @${row.username} из разведки проекта?`)) run(() => removeEntryAction(projectId, row.entryId));
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function CollectAllButton({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => notify(await collectNowAction(projectId)))}>
      <RefreshCwIcon />
      Собрать все сейчас
    </Button>
  );
}
