import type { FeedReel } from "@/lib/db/reels";
import { formatAgo } from "@/lib/format";
import { ReelCard, type ReelCardData } from "@/components/research/reel-card";

export function toCardData(reel: FeedReel, anomalyThreshold: number): ReelCardData {
  return {
    id: reel.id,
    url: reel.url,
    coverUrl: reel.coverUrl,
    caption: reel.caption,
    username: reel.account.username,
    postedLabel: formatAgo(reel.postedAt),
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    durationSec: reel.durationSec,
    multiplier: reel.multiplier,
    medianViews: reel.account.medianViews,
    marked: reel.marks.length > 0,
    anomaly: (reel.multiplier ?? 0) >= anomalyThreshold,
  };
}

export function ReelGrid({
  projectId,
  reels,
  anomalyThreshold,
  canMark,
  empty,
}: {
  projectId: string;
  reels: FeedReel[];
  anomalyThreshold: number;
  canMark: boolean;
  empty: React.ReactNode;
}) {
  if (reels.length === 0) {
    return <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {reels.map((reel) => (
        <ReelCard key={reel.id} projectId={projectId} reel={toCardData(reel, anomalyThreshold)} canMark={canMark} />
      ))}
    </div>
  );
}
