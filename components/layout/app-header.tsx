"use client";

import { useState } from "react";
import { MenuIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import Link from "next/link";
import type { AccessibleProject } from "@/lib/db/projects";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { Sidebar, type SidebarSection, type SidebarSpend } from "@/components/layout/sidebar";
import { UserMenu, type UserSummary } from "@/components/layout/user-menu";

export function AppHeader({
  projectId,
  projects,
  sections,
  spend,
  user,
  canManageProjects,
}: {
  projectId: string;
  projects: AccessibleProject[];
  sections: SidebarSection[];
  spend?: SidebarSpend;
  user: UserSummary;
  canManageProjects: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-4">
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Открыть меню">
            <MenuIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Меню</SheetTitle>
          <Sidebar projectId={projectId} sections={sections} spend={spend} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <ProjectSwitcher projects={projects} currentProjectId={projectId} canManage={canManageProjects} />

      <div className="relative ml-2 hidden max-w-sm flex-1 sm:block">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Поиск: имя, ник, телефон"
          className="h-8 pl-8"
          disabled
          title="Поиск появится вместе с клиентами и лидами (этап 5)"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {sections.some((s) => s.slug === "content-plan") && (
          <Button asChild size="sm" className="h-8">
            <Link href={`/p/${projectId}/content-plan?new=1`}>
              <PlusIcon />
              <span className="hidden sm:inline">Публикация</span>
            </Link>
          </Button>
        )}
        <UserMenu user={user} />
      </div>
    </header>
  );
}
