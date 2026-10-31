import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Новый пароль — Content CRM" };

// Сюда ведёт ссылка из письма (через /auth/callback), пользователь уже вошёл.
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Новый пароль">
      <ResetPasswordForm />
    </AuthCard>
  );
}
