import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Восстановление пароля — Content CRM" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Восстановление пароля"
      description="Пришлём ссылку для смены пароля на вашу почту."
      footer={
        <Link href="/login" className="text-foreground underline">
          Вернуться ко входу
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
