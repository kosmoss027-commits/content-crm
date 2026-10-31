import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

/** Обновляет сессию Supabase в куках и сообщает, вошёл ли пользователь. */
export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([header, value]) => response.headers.set(header, value));
      },
    },
  });

  // Между createServerClient и getClaims ничего не вызываем: иначе возможны случайные разлогины.
  const { data } = await supabase.auth.getClaims();
  return { response, isSignedIn: Boolean(data?.claims) };
}

/** Редирект, который сохраняет обновлённые куки сессии. */
export function redirectKeepingCookies(from: NextResponse, url: URL) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}
