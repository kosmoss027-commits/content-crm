import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireProjectContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { instagramClient } from "@/lib/instagram/client";
import { siteUrl } from "@/lib/supabase/env";

const STATE_COOKIE = "ig_oauth";

// Кнопка «Подключить Instagram»: отправляет владельца на официальную страницу входа Instagram.
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project") ?? "";
  const ctx = await requireProjectContext(projectId);
  if (!can(ctx.role, "project.manage")) return new NextResponse("Подключать Instagram может только владелец", { status: 403 });

  // Одноразовая метка защищает от подделки ответа (CSRF): сверяется в callback
  const nonce = randomBytes(24).toString("base64url");
  let url: string;
  try {
    url = instagramClient.authorizeUrl(nonce, `${siteUrl()}/api/instagram/callback`);
  } catch {
    return NextResponse.redirect(`${siteUrl()}/p/${projectId}/settings?instagram=not-configured#instagram`);
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, `${nonce}.${ctx.projectId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/api/instagram",
  });
  return response;
}
