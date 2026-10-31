import { notFound } from "next/navigation";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection, findSection } from "@/lib/navigation";
import { NoAccess, SectionPlaceholder } from "@/components/section-placeholder";

// Разделы, которые ещё не реализованы: заголовок, описание и этап, на котором они появятся.
export async function generateMetadata({ params }: PageProps<"/p/[projectId]/[section]">) {
  const section = findSection((await params).section);
  return { title: section ? `${section.title} — Content CRM` : "Content CRM" };
}

export default async function SectionPage({ params }: PageProps<"/p/[projectId]/[section]">) {
  const { projectId, section: slug } = await params;
  const ctx = await requireProjectContext(projectId);
  const section = findSection(slug);
  if (!section) notFound();
  if (!canOpenSection(ctx.role, slug)) return <NoAccess />;

  return <SectionPlaceholder section={section} />;
}
