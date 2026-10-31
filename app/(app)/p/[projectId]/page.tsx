import { redirect } from "next/navigation";
import { requireProjectContext } from "@/lib/auth/session";
import { homeSectionFor } from "@/lib/navigation";

export default async function ProjectHomePage({ params }: PageProps<"/p/[projectId]">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  redirect(`/p/${projectId}/${homeSectionFor(ctx.role)}`);
}
