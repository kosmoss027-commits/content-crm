// Текущий пользователь и доступ к проекту для серверных страниц и действий.
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/db/errors";
import { getProjectContext, type ProjectContext } from "@/lib/db/access";
import { syncUser, type AuthIdentity } from "@/lib/db/users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEV_USER_COOKIE, isDevAuthEnabled } from "@/lib/auth/dev";

async function readDevIdentity(): Promise<AuthIdentity | null> {
  const id = (await cookies()).get(DEV_USER_COOKIE)?.value;
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } : null;
}

async function readSupabaseIdentity(): Promise<AuthIdentity | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !claims.email) return null;

  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
  return {
    id: claims.sub,
    email: claims.email,
    name: text(meta.full_name) ?? text(meta.name),
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
  };
}

export const getAuthIdentity = cache(async (): Promise<AuthIdentity | null> => {
  return isDevAuthEnabled() ? readDevIdentity() : readSupabaseIdentity();
});

/** Пользователь из базы; без входа — редирект на /login. */
export const requireUser = cache(async () => {
  const identity = await getAuthIdentity();
  if (!identity) redirect("/login");
  return syncUser(identity);
});

/** Доступ к проекту из URL; чужой или несуществующий проект — 404. */
export const requireProjectContext = cache(async (projectId: string): Promise<ProjectContext> => {
  const user = await requireUser();
  try {
    return await getProjectContext(user.id, projectId);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
});
