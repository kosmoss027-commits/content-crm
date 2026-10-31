"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { GROUP_TITLES, type Section, type SectionGroup } from "@/lib/navigation";
import { Logo } from "@/components/layout/logo";
import { SectionIcon } from "@/components/layout/section-icon";

export type SidebarSection = Pick<Section, "slug" | "title" | "icon" | "group" | "stage">;

const GROUP_ORDER: SectionGroup[] = ["factory", "crm", "system"];

export function Sidebar({
  projectId,
  sections,
  onNavigate,
}: {
  projectId: string;
  sections: SidebarSection[];
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
    </nav>
  );
}
