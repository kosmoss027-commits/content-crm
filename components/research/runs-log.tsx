import type { RunView } from "@/lib/db/reels";
import { formatDateTime, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const KIND_LABELS: Record<string, string> = {
  INITIAL: "Первый сбор",
  SCHEDULED: "По расписанию",
  MANUAL: "Вручную",
  PROFILE: "Профили",
};

const STATUS: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
  RUNNING: { label: "Идёт", variant: "default" },
  SUCCEEDED: { label: "Готово", variant: "secondary" },
  FAILED: { label: "Ошибка", variant: "destructive" },
  SKIPPED: { label: "Пропущен", variant: "outline" },
};

export function RunsLog({ runs }: { runs: RunView[] }) {
  if (runs.length === 0) {
    return <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">Сборов ещё не было.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Когда</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Собрано</TableHead>
            <TableHead className="text-right">Стоимость</TableHead>
            <TableHead>Аккаунты и ошибки</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell className="text-xs whitespace-nowrap">{formatDateTime(run.startedAt)}</TableCell>
              <TableCell className="text-xs">{KIND_LABELS[run.kind] ?? run.kind}</TableCell>
              <TableCell>
                <Badge variant={STATUS[run.status]?.variant ?? "outline"}>{STATUS[run.status]?.label ?? run.status}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{run.status === "RUNNING" ? "…" : run.itemsCount}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {run.status === "RUNNING" ? `~${formatUsd(run.estimatedUsd)}` : formatUsd(run.costUsd)}
              </TableCell>
              <TableCell className="max-w-md text-xs">
                <span className="text-muted-foreground">{run.accounts.map((a) => `@${a}`).join(", ")}</span>
                {run.failed.length > 0 && <p className="text-destructive">Не собраны: {run.failed.join("; ")}</p>}
                {run.error && <p className="text-destructive">{run.error}</p>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
