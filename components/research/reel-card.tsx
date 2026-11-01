"use client";

import { useTransition } from "react";
import { ExternalLinkIcon, FlameIcon, PlayIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/forms";
import { cn } from "@/lib/utils";
import { formatCount, formatDuration, formatMultiplier } from "@/lib/format";
import { toggleMarkAction } from "@/app/(app)/p/[projectId]/research/actions";

export type ReelCardData = {
  id: string;
  url: string;
  coverUrl: string | null;
  caption: string | null;
  username: string;
  postedLabel: string;
  views: number;
  likes: number | null;
  comments: number | null;
  durationSec: number | null;
  multiplier: number | null;
  medianViews: number | null;
  marked: boolean;
  anomaly: boolean;
};

export function ReelCard({ projectId, reel, canMark }: { projectId: string; reel: ReelCardData; canMark: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <a href={reel.url} target="_blank" rel="noreferrer" className="relative block aspect-[9/12] bg-muted">
        {reel.coverUrl ? (
          // Обложки Instagram: next/image их не кэширует, грузим напрямую без referrer
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reel.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          <PlayIcon className="absolute inset-0 m-auto size-8 text-muted-foreground" />
        )}
        <Badge
          className={cn(
            "absolute top-2 left-2 h-6 px-2 text-sm font-semibold",
            reel.anomaly ? "bg-rose-500 text-white" : "bg-amber-400 text-black",
          )}
        >
          {reel.anomaly && <FlameIcon />}
          {formatMultiplier(reel.multiplier)}
        </Badge>
        {reel.durationSec && (
          <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 text-xs text-white">
            {formatDuration(reel.durationSec)}
          </span>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-2 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <a
            href={`https://www.instagram.com/${reel.username}/`}
            target="_blank"
            rel="noreferrer"
            className="truncate font-medium hover:underline"
          >
            @{reel.username}
          </a>
          <span className="shrink-0 text-xs text-muted-foreground">{reel.postedLabel}</span>
        </div>
        <p className="tabular-nums">
          <span className="font-semibold">{formatCount(reel.views)}</span>
          <span className="text-muted-foreground"> просм. · медиана {formatCount(reel.medianViews)}</span>
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          ♥ {formatCount(reel.likes)} · 💬 {formatCount(reel.comments)}
        </p>
        {reel.caption && <p className="line-clamp-2 text-xs text-muted-foreground">{reel.caption}</p>}
        <div className="mt-auto flex gap-2 pt-1">
          {canMark && (
            <Button
              size="sm"
              variant={reel.marked ? "secondary" : "outline"}
              className="flex-1"
              disabled={pending}
              onClick={() => startTransition(async () => notify(await toggleMarkAction(projectId, reel.id)))}
            >
              {reel.marked ? "В работе ✓" : "В работу"}
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild aria-label="Открыть в Instagram">
            <a href={reel.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon />
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
