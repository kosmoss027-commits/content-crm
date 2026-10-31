import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { safeNextPath } from "@/lib/auth/redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { devSignIn } from "@/app/(auth)/actions";
import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { GoogleButton, LoginForm } from "@/components/auth/auth-forms";
import { SubmitButton } from "@/components/forms";

export const metadata = { title: "Вход — Content CRM" };

const ERRORS: Record<string, string> = {
  link: "Ссылка устарела или уже использована. Попробуйте ещё раз.",
  google: "Не удалось войти через Google.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  if (isDevAuthEnabled()) return <DevLogin next={next} />;
  if (!isSupabaseConfigured()) return <NotConfiguredNotice />;

  return (
    <AuthCard
      title="Вход"
      footer={
        <>
          Нет аккаунта?{" "}
          <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-foreground underline">
            Зарегистрироваться
          </Link>
        </>
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      <GoogleButton next={next} />
      <Divider />
      <LoginForm next={next} />
    </AuthCard>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      или по email
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Локальный вход тестовыми пользователями (DEV_AUTH=1). */
async function DevLogin({ next }: { next: string }) {
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true, memberships: { select: { role: true, workspace: { select: { name: true } } } } },
  });

  return (
    <AuthCard title="Вход для разработки" description="DEV_AUTH=1: выберите тестового пользователя из seed.">
      {users.length === 0 && <p className="text-sm text-muted-foreground">Пользователей нет. Запустите npm run db:seed.</p>}
      {users.map((user) => (
        <form key={user.id} action={devSignIn}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="next" value={next} />
          <SubmitButton variant="outline" className="h-auto w-full justify-start py-2 text-left">
            <span className="grid">
              <span>{user.name ?? user.email}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {user.email} · {user.memberships.map((m) => `${m.workspace.name}: ${m.role}`).join(", ")}
              </span>
            </span>
          </SubmitButton>
        </form>
      ))}
    </AuthCard>
  );
}
