import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireProjectContext, requireUser } from "@/lib/auth/session";
import { listAccessibleProjects } from "@/lib/db/projects";
import { sectionsForRole } from "@/lib/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { RememberProject } from "@/components/layout/remember-project";
import { Sidebar, type SidebarSection } from "@/components/layout/sidebar";

export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[projectId]">) {
  const { projectId } = await params;
  const [user, ctx] = await Promise.all([requireUser(), requireProjectContext(projectId)]);
  const projects = await listAccessibleProjects(user.id);

  const sections: SidebarSection[] = sectionsForRole(ctx.role).map(({ slug, title, icon, group, stage }) => ({
    slug,
    title,
    icon,
    group,
    stage,
  }));

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r bg-sidebar md:block">
        <Sidebar projectId={projectId} sections={sections} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          projectId={projectId}
          projects={projects}
          sections={sections}
          canManageProjects={can(ctx.role, "project.manage")}
          user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl, roleLabel: ROLE_LABELS[ctx.role] }}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
      <RememberProject projectId={projectId} />
    </div>
  );
}
