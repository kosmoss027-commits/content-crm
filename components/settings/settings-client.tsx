"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, notify, SubmitButton, useActionToast } from "@/components/forms";
import {
  archiveProjectAction,
  createProjectAction,
  renameWorkspaceAction,
  restoreProjectAction,
  updateProjectAction,
  updateThresholdsAction,
} from "@/app/(app)/p/[projectId]/settings/actions";

const PROJECT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#a855f7", "#64748b"];

function ColorInput({ defaultValue }: { defaultValue: string }) {
  return (
    <Input
      type="color"
      name="color"
      defaultValue={defaultValue}
      list="project-colors"
      className="h-8 w-10 shrink-0 cursor-pointer p-1"
      aria-label="Цвет проекта"
    />
  );
}

function ProjectColorList() {
  return (
    <datalist id="project-colors">
      {PROJECT_COLORS.map((color) => (
        <option key={color} value={color} />
      ))}
    </datalist>
  );
}

export function WorkspaceNameForm({ projectId, name }: { projectId: string; name: string }) {
  const [state, action] = useActionState(renameWorkspaceAction.bind(null, projectId), null);
  useActionToast(state);
  return (
    <form action={action} className="flex max-w-md items-end gap-2">
      <div className="flex-1">
        <Field label="Название" name="name" defaultValue={name} required maxLength={60} />
      </div>
      <SubmitButton variant="secondary">Сохранить</SubmitButton>
    </form>
  );
}

type ProjectView = { id: string; name: string; color: string; archived: boolean; current: boolean };

export function ProjectRow({ projectId, project }: { projectId: string; project: ProjectView }) {
  const [state, action] = useActionState(updateProjectAction.bind(null, projectId, project.id), null);
  const [pending, startTransition] = useTransition();
  useActionToast(state);

  const archive = () => {
    if (!confirm(`Отправить «${project.name}» в архив? Данные сохранятся, проект можно будет восстановить.`)) return;
    startTransition(async () => notify(await archiveProjectAction(projectId, project.id)));
  };
  const restore = () => startTransition(async () => notify(await restoreProjectAction(projectId, project.id)));

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <form action={action} className="flex min-w-0 flex-1 items-center gap-2">
        <ColorInput defaultValue={project.color} />
        <Input
          name="name"
          defaultValue={project.name}
          required
          maxLength={60}
          className="h-8 min-w-40 flex-1"
          aria-label="Название проекта"
          disabled={project.archived}
        />
        {!project.archived && (
          <SubmitButton size="sm" variant="ghost">
            Сохранить
          </SubmitButton>
        )}
      </form>
      {project.current && <Badge variant="secondary">открыт</Badge>}
      {project.archived ? (
        <Button size="sm" variant="outline" onClick={restore} disabled={pending}>
          <ArchiveRestoreIcon />
          Восстановить
        </Button>
      ) : (
        !project.current && (
          <Button size="sm" variant="ghost" onClick={archive} disabled={pending} aria-label={`Архивировать ${project.name}`}>
            <ArchiveIcon />
          </Button>
        )
      )}
    </li>
  );
}

export function CreateProjectForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(createProjectAction.bind(null, projectId), null);
  const formRef = useRef<HTMLFormElement>(null);
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
      <ProjectColorList />
      <ColorInput defaultValue={PROJECT_COLORS[1]} />
      <Input
        name="name"
        placeholder="Клиент: автоподбор"
        required
        maxLength={60}
        className="h-8 max-w-xs flex-1"
        aria-label="Название нового проекта"
      />
      <SubmitButton size="sm">Добавить проект</SubmitButton>
    </form>
  );
}

export function ThresholdsForm({ projectId, viral, anomaly }: { projectId: string; viral: number; anomaly: number }) {
  const [state, action] = useActionState(updateThresholdsAction.bind(null, projectId), null);
  useActionToast(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="w-36">
        <Field label="Залёт от ×" name="viral" type="number" step="0.5" min="1.5" defaultValue={viral} required />
      </div>
      <div className="w-36">
        <Field label="Аномалия от ×" name="anomaly" type="number" step="1" min="2" defaultValue={anomaly} required />
      </div>
      <SubmitButton variant="secondary">Сохранить</SubmitButton>
    </form>
  );
}
