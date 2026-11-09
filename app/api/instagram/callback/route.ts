import { after, NextResponse, type NextRequest } from "next/server";
import { requireProjectContext } from "@/lib/auth/session";
import { instagramClient } from "@/lib/instagram/client";
import { saveConnection, syncInstagram } from "@/lib/instagram/sync";
import { secretMatches } from "@/lib/secrets";
import { siteUrl } from "@/lib/supabase/env";

const STATE_COOKIE = "ig_oauth";

// Instagram возвращает сюда владельца после входа: меняем код на долгий доступ и сохраняем его зашифрованным.
export async function GET(request: NextRequest) {
  const [nonce, projectId] = (request.cookies.get(STATE_COOKIE)?.value ?? "").split(".");
  const settings = (status: string) => {
    const response = NextResponse.redirect(`${siteUrl()}/p/${projectId}/settings?instagram=${status}#instagram`);
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/instagram" });
    return response;
  };
  if (!projectId) return NextResponse.redirect(`${siteUrl()}/`);

  const params = request.nextUrl.searchParams;
  if (!secretMatches(params.get("state"), nonce)) return settings("error");
  if (params.get("error")) return settings("denied");
  const code = params.get("code");
  if (!code) return settings("error");

  try {
    const ctx = await requireProjectContext(projectId);
    const token = await instagramClient.exchangeCode(code, `${siteUrl()}/api/instagram/callback`);
    const profile = await instagramClient.profile(token.accessToken);
    await saveConnection(ctx, token, profile);
    // Первое обновление публикаций — после ответа, чтобы не держать страницу
    after(() => syncInstagram(ctx.projectId, instagramClient).then(() => undefined));
    return settings("connected");
  } catch (error) {
    console.error("Instagram: не удалось подключить", error instanceof Error ? error.message : error);
    return settings("error");
  }
}
