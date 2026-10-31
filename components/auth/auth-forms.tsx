"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/forms";
import {
  requestPasswordReset,
  signIn,
  signInWithGoogle,
  signUp,
  updatePassword,
} from "@/app/(auth)/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Пароль" name="password" type="password" autoComplete="current-password" required />
      <FormMessage state={state} />
      <SubmitButton className="w-full">Войти</SubmitButton>
      <Link href="/forgot-password" className="text-center text-sm text-muted-foreground hover:text-foreground">
        Забыли пароль?
      </Link>
    </form>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUp, null);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Имя" name="name" autoComplete="name" />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Пароль (минимум 8 символов)" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <FormMessage state={state} />
      <SubmitButton className="w-full">Создать аккаунт</SubmitButton>
    </form>
  );
}

export function GoogleButton({ next }: { next: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <SubmitButton variant="outline" className="w-full">
        Войти через Google
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <FormMessage state={state} />
      <SubmitButton className="w-full">Прислать ссылку</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Новый пароль" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <Field label="Повторите пароль" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      <FormMessage state={state} />
      <SubmitButton className="w-full">Сохранить пароль</SubmitButton>
    </form>
  );
}
