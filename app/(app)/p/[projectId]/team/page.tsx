import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireProjectContext } from "@/lib/auth/session";
import { listPendingInvites } from "@/lib/db/invites";
import { listMembers } from "@/lib/db/members";
import { openTaskCounts } from "@/lib/db/tasks";
import { siteUrl } from "@/lib/supabase/env";
import { PageHeader } from "@/components/section-placeholder";
import { InviteForm, InviteList, MemberList } from "@/components/team/team-client";

export const metadata = { title: "Команда — Content CRM" };

export default async function TeamPage({ params }: PageProps<"/p/[projectId]/team">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  const canManage = can(ctx.role, "member.manage");
  const [members, invites, taskCounts] = await Promise.all([listMembers(ctx), canManage ? listPendingInvites(ctx) : [], openTaskCounts(ctx)]);

  return (
    <>
      <PageHeader
        title="Команда"
        description={`Участники пространства «${ctx.workspace.name}». Доступ даётся ко всем проектам пространства.`}
      />
      <div className="grid gap-8">
        <MemberList
          projectId={projectId}
          canManage={canManage}
          currentUserId={ctx.userId}
          members={members.map((m) => ({
            id: m.id,
            userId: m.user.id,
            role: m.role,
            name: m.user.name,
            email: m.user.email,
            avatarUrl: m.user.avatarUrl,
            openTasks: taskCounts[m.user.id] ?? 0,
          }))}
        />
        {canManage && (
          <>
            <InviteForm projectId={projectId} />
            <InviteList
              projectId={projectId}
              invites={invites.map((invite) => ({
                id: invite.id,
                email: invite.email,
                roleLabel: ROLE_LABELS[invite.role],
                link: `${siteUrl()}/invite/${invite.token}`,
                expiresAt: invite.expiresAt.toISOString(),
              }))}
            />
          </>
        )}
        <RoleHelp />
      </div>
    </>
  );
}

function RoleHelp() {
  const rows = [
    ["Владелец", "видит всё, управляет проектами, командой и настройками"],
    ["Менеджер", "сводка, кодовые слова, заявки, клиенты, задачи"],
    ["Ассистент и SMM", "контент-завод, контент-план, статистика, прогревы, задачи"],
  ];
  return (
    <section className="grid gap-2 text-sm">
      <h2 className="font-medium">Что видит каждая роль</h2>
      <ul className="grid gap-1 text-muted-foreground">
        {rows.map(([role, text]) => (
          <li key={role}>
            <span className="text-foreground">{role}</span> — {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
