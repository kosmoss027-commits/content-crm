import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { ensureDefaultWorkspace, findLandingProject } from "@/lib/db/users";
import { LAST_PROJECT_COOKIE } from "@/lib/constants";

// Точка входа: создаём пространство новому пользователю и ведём в последний открытый проект.
export default async function HomePage() {
  const user = await requireUser();
  await ensureDefaultWorkspace(user.id);

  const lastProject = (await cookies()).get(LAST_PROJECT_COOKIE)?.value;
  const projectId = await findLandingProject(user.id, lastProject);
  if (!projectId) redirect("/login");

  redirect(`/p/${projectId}`);
}
