import type { ScriptWithRefs } from "@/lib/db/scripts";
import { ScriptCard, type ScriptCardData } from "@/components/factory/script-card";

export function toScriptCard(script: ScriptWithRefs): ScriptCardData {
  const reel = script.analysis?.reel;
  return {
    id: script.id,
    title: script.title,
    hook: script.hook,
    shots: Array.isArray(script.shots) ? (script.shots as ScriptCardData["shots"]) : [],
    ending: script.ending,
    caption: script.caption,
    status: script.status,
    auto: script.auto,
    reference: reel ? { url: reel.url, username: reel.account.username, multiplier: reel.multiplier } : null,
    lastRevision: script.revisions[0]?.instruction ?? null,
  };
}

export function ScriptList({
  projectId,
  scripts,
  canEdit,
  empty,
}: {
  projectId: string;
  scripts: ScriptWithRefs[];
  canEdit: boolean;
  empty: React.ReactNode;
}) {
  if (scripts.length === 0) {
    return <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {scripts.map((script) => (
        <ScriptCard key={script.id} projectId={projectId} script={toScriptCard(script)} canEdit={canEdit} />
      ))}
    </div>
  );
}
