import Link from "next/link";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { getAuthIdentity } from "@/lib/auth/session";
import { getInviteByToken } from "@/lib/db/invites";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/components/auth/auth-card";
import { Logo } from "@/components/layout/logo";
import { AcceptInviteForm } from "@/components/team/accept-invite-form";

export const metadata = { title: "Приглашение — Content CRM" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invite, identity] = await Promise.all([getInviteByToken(token), getAuthIdentity()]);
  const next = `/invite/${token}`;

  const body = (() => {
    if (!invite || invite.acceptedAt) {
      return <AuthCard title="Приглашение недействительно" description="Ссылка неверная или уже использована." />;
    }
    if (invite.expiresAt < new Date()) {
      return <AuthCard title="Срок приглашения истёк" description="Попросите владельца пространства прислать новое." />;
    }

    const inviter = invite.invitedBy.name ?? invite.invitedBy.email;
    const description = `${inviter} приглашает вас в «${invite.workspace.name}» с ролью «${ROLE_LABELS[invite.role]}».`;

    if (!identity) {
      return (
        <AuthCard title="Приглашение в команду" description={description}>
          <p className="text-sm text-muted-foreground">
            Войдите или зарегистрируйтесь с email <span className="text-foreground">{invite.email}</span>.
          </p>
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(next)}`}>Войти</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/signup?next=${encodeURIComponent(next)}`}>Зарегистрироваться</Link>
          </Button>
        </AuthCard>
      );
    }

    return (
      <AuthCard title="Приглашение в команду" description={description}>
        <AcceptInviteForm token={token} />
      </AuthCard>
    );
  })();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo />
      <div className="w-full max-w-sm">{body}</div>
    </main>
  );
}
