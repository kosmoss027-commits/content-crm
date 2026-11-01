"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { GROUP_TITLES, type Section, type SectionGroup } from "@/lib/navigation";
import { Logo } from "@/components/layout/logo";
import { SectionIcon } from "@/components/layout/section-icon";

export type SidebarSection = Pick<Section, "slug" | "title" | "icon" | "group" | "stage">;

/** Расходы на сбор роликов: показываем ролям с доступом к разведке. */
export type SidebarSpend = { todayUsd: number; monthUsd: number; monthItems: number; limitUsd: number; limitReached: boolean };

const GROUP_ORDER: SectionGroup[] = ["factory", "crm", "system"];

function SpendWidget({ spend }: { spend: SidebarSpend }) {
  const percent = Math.min(100, Math.round((spend.monthUsd / spend.limitUsd) * 100));
  return (
    <div className="grid gap-1.5 rounded-lg border px-2.5 py-2 text-xs" title="Расходы на сбор роликов (Apify)">
      <div className="flex justify-between text-muted-foreground">
        <span>Сбор за месяц</span>
        <span className="tabular-nums">
          ${spend.monthUsd.toFixed(2)} / ${spend.limitUsd}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", spend.limitReached ? "bg-destructive" : "bg-emerald-500")} style={{ width: `${percent}%` }} />
      </div>
      <div className="flex justify-between text-muted-foreground tabular-nums">
        <span>сегодня ${spend.todayUsd.toFixed(2)}</span>
        <span>{spend.monthItems} роликов</span>
      </div>
      {spend.limitReached && <p className="text-destructive">Лимит исчерпан — сбор остановлен</p>}
    </div>
  );
}

export function Sidebar({
  projectId,
  sections,
  spend,
  onNavigate,
}: {
  projectId: string;
  sections: SidebarSection[];
  spend?: SidebarSpend;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-4" aria-label="Разделы">
      <Logo className="px-2 text-sm" />
      {GROUP_ORDER.map((group) => {
        const items = sections.filter((section) => section.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className={cn("grid gap-0.5", group === "system" && "mt-auto")}>
            <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {GROUP_TITLES[group]}
            </p>
            {items.map((section) => {
              const href = `/p/${projectId}/${section.slug}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={section.slug}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    active && "bg-sidebar-accent font-medium text-sidebar-foreground",
                  )}
                >
                  <SectionIcon name={section.icon} className="size-4 shrink-0" />
                  <span className="truncate">{section.title}</span>
                  {section.stage > 1 && (
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">эт. {section.stage}</span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
      {spend && <SpendWidget spend={spend} />}
    </nav>
  );
}
