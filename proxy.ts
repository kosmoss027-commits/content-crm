import { NextResponse, type NextRequest } from "next/server";
import { DEV_USER_COOKIE, isDevAuthEnabled } from "@/lib/auth/dev";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { redirectKeepingCookies, updateSupabaseSession } from "@/lib/supabase/proxy";

// Страницы, открытые без входа.
const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/auth", "/invite"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function loginUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return url;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isDevAuthEnabled() || !isSupabaseConfigured()) {
    const signedIn = isDevAuthEnabled() && request.cookies.has(DEV_USER_COOKIE);
    if (signedIn || isPublic(pathname)) return NextResponse.next();
    return NextResponse.redirect(loginUrl(request));
  }

  const { response, isSignedIn } = await updateSupabaseSession(request);
  if (!isSignedIn && !isPublic(pathname)) {
    return redirectKeepingCookies(response, loginUrl(request));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
