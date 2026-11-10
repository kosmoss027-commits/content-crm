import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireProjectContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { canOpenSection } from "@/lib/navigation";
import { BOARD_SIZE, listBoardItems } from "@/lib/db/board";
import { getCampaign } from "@/lib/db/warmups";
import { NoAccess, PageHeader } from "@/components/section-placeholder";
import { WarmupBoard } from "@/components/work/warmup-board";

export const metadata = { title: "Доска прогрева — Content CRM" };

export default async function BoardPage({ params }: PageProps<"/p/[projectId]/warmups/[campaignId]/board">) {
  const { projectId, campaignId } = await params;
  const ctx = await requireProjectContext(projectId);
  if (!canOpenSection(ctx.role, "warmups")) return <NoAccess />;

  const [campaign, items] = await Promise.all([getCampaign(ctx, campaignId), listBoardItems(ctx, campaignId)]);

  return (
    <>
      <Link href={`/p/${projectId}/warmups/${campaign.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeftIcon className="size-3.5" /> {campaign.name}
      </Link>
      <PageHeader title="Доска" description="Идеи, смыслы и референсы прогрева на одном полотне." />
      <WarmupBoard
        projectId={projectId}
        campaignId={campaign.id}
        size={BOARD_SIZE}
        canEdit={can(ctx.role, "content.manage")}
        initial={items.map((i) => ({ id: i.id, kind: i.kind, x: i.x, y: i.y, width: i.width, height: i.height, text: i.text, color: i.color, imageUrl: i.imageUrl }))}
      />
    </>
  );
}
