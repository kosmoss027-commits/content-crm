"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canOpenSection } from "@/lib/navigation";
import type { AccessibleProject } from "@/lib/db/projects";

function ProjectDot({ color }: { color: string }) {
  return <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />;
}

export function ProjectSwitcher({
  projects,
  currentProjectId,
  canManage,
}: {
  projects: AccessibleProject[];
  currentProjectId: string;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const current = projects.find((project) => project.id === currentProjectId);
  const currentSection = pathname.split("/")[3];

  // Остаёмся в том же разделе, если в новом проекте у роли есть к нему доступ.
  const hrefFor = (project: AccessibleProject) =>
    currentSection && canOpenSection(project.role, currentSection)
      ? `/p/${project.id}/${currentSection}`
      : `/p/${project.id}`;

  const workspaces = [...new Map(projects.map((p) => [p.workspaceId, p.workspaceName])).entries()];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 max-w-56 justify-start gap-2 px-2" aria-label="Переключить проект">
          {current && <ProjectDot color={current.color} />}
          <span className="truncate font-medium">{current?.name ?? "Проект"}</span>
          <ChevronsUpDownIcon className="ml-auto size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {workspaces.map(([workspaceId, workspaceName], index) => (
          <DropdownMenuGroup key={workspaceId}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">{workspaceName}</DropdownMenuLabel>
            {projects
              .filter((project) => project.workspaceId === workspaceId)
              .map((project) => (
                <DropdownMenuItem key={project.id} asChild>
                  <Link href={hrefFor(project)}>
                    <ProjectDot color={project.color} />
                    <span className="truncate">{project.name}</span>
                    {project.id === currentProjectId && <CheckIcon className="ml-auto size-4" />}
                  </Link>
                </DropdownMenuItem>
              ))}
          </DropdownMenuGroup>
        ))}
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/p/${currentProjectId}/settings#projects`}>
                <PlusIcon className="size-4" />
                Новый проект
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
