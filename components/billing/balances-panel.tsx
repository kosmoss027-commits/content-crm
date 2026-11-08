import { ExternalLinkIcon } from "lucide-react";
import { BILLING_LINKS, LOW_BALANCE_USD } from "@/config/billing";
import type { ServiceBalances } from "@/lib/billing/balances";
import { formatDate, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

type Row = { name: string; purpose: string; value: string; note: string; warn: boolean; href: string; action: string };

function rows(b: ServiceBalances): Row[] {
  const missing = "нет данных";
  return [
    {
      name: "OpenRouter",
      purpose: "ИИ: разбор и сценарии",
      value: b.openrouter ? `осталось ${formatUsd(b.openrouter.remainingUsd)}` : missing,
      note: b.openrouter ? `пополнено ${formatUsd(b.openrouter.totalUsd)}, потрачено ${formatUsd(b.openrouter.usedUsd)}` : "",
      warn: b.openrouter !== null && b.openrouter.remainingUsd < LOW_BALANCE_USD,
      href: BILLING_LINKS.openrouter,
      action: "Пополнить",
    },
    {
      name: "Apify",
      purpose: "Сбор роликов и подписчиков",
      value: b.apify ? `${formatUsd(b.apify.usedUsd)} из ${formatUsd(b.apify.limitUsd)} в месяц` : missing,
      note: b.apify?.cycleEndsAt ? `бесплатный лимит обновится ${formatDate(b.apify.cycleEndsAt)}` : "",
      warn: b.apify !== null && b.apify.usedUsd >= b.apify.limitUsd * 0.8,
      href: BILLING_LINKS.apify,
      action: "Открыть Apify",
    },
    {
      name: "Deepgram",
      purpose: "Распознавание речи",
      value: b.deepgram ? `осталось ~${formatUsd(b.deepgram.remainingUsd)} из ${formatUsd(b.deepgram.creditUsd)}` : missing,
      note: "подсчёт CRM по расшифровкам",
      warn: false,
      href: BILLING_LINKS.deepgram,
      action: "Открыть Deepgram",
    },
  ];
}

export function BalancesPanel({ balances }: { balances: ServiceBalances }) {
  return (
    <div className="grid gap-2">
      {rows(balances).map((row) => (
        <div key={row.name} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
          <div className="grid gap-0.5">
            <span className="font-medium">
              {row.name} <span className="font-normal text-muted-foreground">— {row.purpose}</span>
            </span>
            {row.note && <span className="text-xs text-muted-foreground">{row.note}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className="tabular-nums">{row.value}</span>
            {row.warn && <Badge variant="destructive">мало</Badge>}
            <a
              href={row.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              {row.action}
              <ExternalLinkIcon className="size-3" />
            </a>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Render, Supabase и GitHub — бесплатные тарифы. Балансы обновляются раз в 5 минут. Оплата проходит на сайтах сервисов: карту
        Content CRM не видит. Чтобы не следить за OpenRouter, включите там автопополнение (Auto Top-Up).
      </p>
    </div>
  );
}
