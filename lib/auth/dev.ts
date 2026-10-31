// Вход без Supabase для локальной разработки: выбор тестового пользователя из seed.
// Работает только при DEV_AUTH=1 и никогда в production.

export const DEV_USER_COOKIE = "dev_user_id";

export function isDevAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH === "1";
}
