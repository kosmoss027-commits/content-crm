import { can } from "@/lib/auth/permissions";
import { requireProjectContext } from "@/lib/auth/session";
import { canOpenSection } from "@/lib/navigation";
import { getBrandMap, listTechniques } from "@/lib/db/analysis";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { BrandForm, TechniquesPanel } from "@/components/factory/brand-panels";

export const metadata = { title: "Карта бренда — Content CRM" };

export default async function BrandPage({ params }: PageProps<"/p/[projectId]/brand">) {
  const { projectId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "brand")) return <NoAccess />;

  const [brand, techniques] = await Promise.all([getBrandMap(ctx), listTechniques(ctx)]);
  const canEdit = can(ctx.role, "research.manage");

  return (
    <>
      <PageHeader title="Карта бренда" description="Claude учитывает её при отборе роликов, разборе и написании сценариев." />
      <div className="grid gap-10">
        <BrandForm
          projectId={projectId}
          canEdit={canEdit}
          values={{
            author: brand?.author ?? "",
            niche: brand?.niche ?? "",
            audience: brand?.audience ?? "",
            products: brand?.products ?? "",
            tone: brand?.tone ?? "",
            forbidden: brand?.forbidden ?? "",
            examples: brand?.examples ?? "",
            topics: brand?.topics ?? "",
            keywords: brand?.keywords ?? "",
            exclusions: brand?.exclusions ?? "",
            scriptTemplate: brand?.scriptTemplate ?? "",
            relevanceThreshold: brand?.relevanceThreshold ?? 6,
          }}
        />
        <TechniquesPanel
          projectId={projectId}
          canEdit={canEdit}
          techniques={techniques.map((t) => ({ id: t.id, title: t.title, description: t.description, exampleUrl: t.exampleUrl }))}
        />
      </div>
    </>
  );
}
