"use client";

// Небольшие кнопки контент-завода: разобрать, сделать сценарий, сохранить приём, привязать к гипотезе.
import { useState, useTransition } from "react";
import { BookmarkPlusIcon, Loader2Icon, ScanSearchIcon, SparklesIcon } from "lucide-react";
import type { ActionState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/components/forms";
import {
  addTechniqueAction,
  createScriptAction,
  linkReelAction,
  requestAnalysisAction,
} from "@/app/(app)/p/[projectId]/factory-actions";

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionState>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      notify(result);
      if (result?.ok) after?.();
    });
  return { pending, run };
}

export function RequestAnalysisButton({ projectId, reelId, label = "Разобрать сейчас" }: { projectId: string; reelId: string; label?: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => requestAnalysisAction(projectId, reelId))}>
      {pending ? <Loader2Icon className="animate-spin" /> : <ScanSearchIcon />}
      {label}
    </Button>
  );
}

export function CreateScriptButton({ projectId, analysisId, size = "sm" }: { projectId: string; analysisId: string; size?: "sm" | "default" }) {
  const { pending, run } = useRun();
  return (
    <Button size={size} disabled={pending} onClick={() => run(() => createScriptAction(projectId, { analysisId }))}>
      {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
      {pending ? "Claude пишет…" : "Сделать сценарий"}
    </Button>
  );
}

export function IdeaScriptForm({ projectId }: { projectId: string }) {
  const { pending, run } = useRun();
  const [idea, setIdea] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => createScriptAction(projectId, { idea }), () => setIdea(""));
      }}
    >
      <Input
        value={idea}
        onChange={(event) => setIdea(event.target.value)}
        placeholder="Своя идея: о чём ролик, для кого, что продаём"
        maxLength={1000}
        className="h-9 min-w-64 flex-1"
        aria-label="Идея сценария"
      />
      <Button type="submit" disabled={pending || !idea.trim()}>
        {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
        {pending ? "Claude пишет…" : "Сценарий по идее"}
      </Button>
    </form>
  );
}

export function SaveTechniqueButton({ projectId, title, exampleUrl }: { projectId: string; title: string; exampleUrl: string }) {
  const { pending, run } = useRun();
  const [saved, setSaved] = useState(false);
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-6"
      disabled={pending || saved}
      title="Сохранить приём в банк"
      aria-label={`Сохранить приём «${title}» в банк`}
      onClick={() => run(() => addTechniqueAction(projectId, { title: title.slice(0, 120), exampleUrl }), () => setSaved(true))}
    >
      <BookmarkPlusIcon className="size-3.5" />
    </Button>
  );
}

export function LinkHypothesisSelect({
  projectId,
  reelId,
  hypotheses,
}: {
  projectId: string;
  reelId: string;
  hypotheses: { id: string; text: string }[];
}) {
  const { pending, run } = useRun();
  if (hypotheses.length === 0) return null;
  return (
    <Select disabled={pending} onValueChange={(hypothesisId) => run(() => linkReelAction(projectId, hypothesisId, reelId))}>
      <SelectTrigger className="h-8 w-56" aria-label="Добавить к гипотезе">
        <SelectValue placeholder="Добавить к гипотезе…" />
      </SelectTrigger>
      <SelectContent>
        {hypotheses.map((h) => (
          <SelectItem key={h.id} value={h.id}>
            {h.text.slice(0, 60)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
