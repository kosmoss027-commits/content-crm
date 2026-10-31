"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { formText, type ActionState } from "@/lib/actions";
import { DEV_USER_COOKIE, isDevAuthEnabled } from "@/lib/auth/dev";
import { safeNextPath } from "@/lib/auth/redirect";
import { siteUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MIN_PASSWORD = 8;

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный email"),
  password: z.string().min(MIN_PASSWORD, `Пароль — минимум ${MIN_PASSWORD} символов`),
});

/** Переводит частые ошибки Supabase на русский. */
function translateAuthError(message: string): string {
  const known: [RegExp, string][] = [
    [/invalid login credentials/i, "Неверный email или пароль."],
    [/email not confirmed/i, "Email не подтверждён. Проверьте почту и перейдите по ссылке из письма."],
    [/already registered|already been registered/i, "Пользователь с таким email уже есть. Войдите."],
    [/rate limit|too many/i, "Слишком много попыток. Подождите немного и попробуйте снова."],
    [/password/i, "Пароль не подходит: используйте не меньше 8 символов, буквы и цифры."],
  ];
  return known.find(([pattern]) => pattern.test(message))?.[1] ?? "Не удалось выполнить вход. Попробуйте ещё раз.";
}

function callbackUrl(next: string): string {
  return `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentials.safeParse({ email: formText(formData, "email"), password: formText(formData, "password") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, message: translateAuthError(error.message) };

  redirect(safeNextPath(formText(formData, "next")));
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentials.safeParse({ email: formText(formData, "email"), password: formText(formData, "password") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const name = formText(formData, "name").trim().slice(0, 80);
  const next = safeNextPath(formText(formData, "next"));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: callbackUrl(next), data: { full_name: name || undefined } },
  });
  if (error) return { ok: false, message: translateAuthError(error.message) };
  if (data.session) redirect(next);

  return { ok: true, message: "Готово! Мы отправили письмо для подтверждения. Перейдите по ссылке из письма." };
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(safeNextPath(formText(formData, "next"))) },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formText(formData, "email"));
  if (!email.success) return { ok: false, message: "Некорректный email" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: callbackUrl("/reset-password") });
  if (error) return { ok: false, message: translateAuthError(error.message) };

  // Одинаковый ответ, есть такой email или нет: не раскрываем, кто зарегистрирован.
  return { ok: true, message: "Если такой email зарегистрирован, письмо со ссылкой уже в пути." };
}

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = formText(formData, "password");
  if (password.length < MIN_PASSWORD) return { ok: false, message: `Пароль — минимум ${MIN_PASSWORD} символов` };
  if (password !== formText(formData, "confirm")) return { ok: false, message: "Пароли не совпадают" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: translateAuthError(error.message) };

  redirect("/");
}

export async function signOut(): Promise<void> {
  if (isDevAuthEnabled()) {
    (await cookies()).delete(DEV_USER_COOKIE);
  } else {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

/** Только для локальной разработки (DEV_AUTH=1): войти тестовым пользователем. */
export async function devSignIn(formData: FormData): Promise<void> {
  if (!isDevAuthEnabled()) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: formText(formData, "userId") }, select: { id: true } });
  if (!user) redirect("/login");

  (await cookies()).set(DEV_USER_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(safeNextPath(formText(formData, "next")));
}
