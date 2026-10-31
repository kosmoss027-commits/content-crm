import Link from "next/link";
import { safeNextPath } from "@/lib/auth/redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AuthCard, NotConfiguredNotice } from "@/components/auth/auth-card";
import { GoogleButton, SignupForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Регистрация — Content CRM" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const next = safeNextPath((await searchParams).next);
  if (!isSupabaseConfigured()) return <NotConfiguredNotice />;

  return (
    <AuthCard
      title="Регистрация"
      description="Создадим для вас рабочее пространство и первый проект."
      footer={
        <>
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-foreground underline">
            Войти
          </Link>
        </>
      }
    >
      <GoogleButton next={next} />
      <SignupForm next={next} />
    </AuthCard>
  );
}
