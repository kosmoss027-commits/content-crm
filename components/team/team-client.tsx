"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { CopyIcon, XIcon } from "lucide-react";
import type { Role } from "@/lib/generated/prisma/enums";
import { ROLE_LABELS, ROLES } from "@/lib/auth/permissions";
import type { ActionState } from "@/lib/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, notify, SubmitButton, useActionToast } from "@/components/forms";
import { initials } from "@/components/layout/user-menu";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
} from "@/app/(app)/p/[projectId]/team/actions";

type Member = { id: string; userId: string; role: Role; name: string | null; email: string; avatarUrl: string | null; openTasks?: number };
type PendingInvite = { id: string; email: string; roleLabel: string; link: string; expiresAt: string };

function RoleSelect({
  name,
  value,
  onChange,
  disabled,
}: {
  name?: string;
  value?: Role;
  onChange?: (role: Role) => void;
  disabled?: boolean;
}) {
  return (
    <Select name={name} defaultValue={value ?? "SMM"} onValueChange={(v) => onChange?.(v as Role)} disabled={disabled}>
      <SelectTrigger className="h-8 w-36" aria-label="Роль">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function MemberList({
  projectId,
  members,
  canManage,
  currentUserId,
}: {
  projectId: string;
  members: Member[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionState>) => startTransition(async () => notify(await fn()));

  return (
    <section className="grid gap-3">
      <h2 className="font-medium">Участники · {members.length}</h2>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Человек</TableHead>
              <TableHead className="w-40">Роль</TableHead>
              {canManage && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-7">
                      {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
                      <AvatarFallback className="text-xs">{initials(member.name, member.email)}</AvatarFallback>
                    </Avatar>
                    <div className="grid min-w-0">
                      <span className="truncate">
                        {member.name ?? member.email}
                        {member.userId === currentUserId && <span className="text-muted-foreground"> (вы)</span>}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {member.email}
                        {member.openTasks ? ` · открытых задач: ${member.openTasks}` : ""}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <RoleSelect
                      value={member.role}
                      disabled={pending}
                      onChange={(role) => run(() => changeRoleAction(projectId, member.id, role))}
                    />
                  ) : (
                    <span className="text-sm">{ROLE_LABELS[member.role]}</span>
                  )}
                </TableCell>
                {canManage && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      aria-label={`Удалить ${member.email}`}
                      onClick={() => {
                        if (confirm(`Удалить ${member.email} из пространства?`)) {
                          run(() => removeMemberAction(projectId, member.id));
                        }
                      }}
                    >
                      <XIcon />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export function InviteForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(inviteMemberAction.bind(null, projectId), null);
  useActionToast(state);

  return (
    <section className="grid gap-3">
      <h2 className="font-medium">Пригласить</h2>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field label="Email" name="email" type="email" placeholder="name@example.com" required />
        </div>
        <div className="grid gap-1.5">
          <Label>Роль</Label>
          <RoleSelect name="role" />
        </div>
        <SubmitButton>Создать приглашение</SubmitButton>
      </form>
      <p className="text-xs text-muted-foreground">
        Пока письма не отправляются автоматически: скопируйте ссылку из списка ниже и отправьте её сами. Ссылка
        действует 7 дней, войти по ней можно только с указанным email.
      </p>
    </section>
  );
}

export function InviteList({ projectId, invites }: { projectId: string; invites: PendingInvite[] }) {
  const [pending, startTransition] = useTransition();
  if (invites.length === 0) return null;

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать. Выделите ссылку вручную.");
    }
  };

  return (
    <section className="grid gap-3">
      <h2 className="font-medium">Ожидают ответа · {invites.length}</h2>
      <ul className="grid gap-2">
        {invites.map((invite) => (
          <li key={invite.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {invite.email} · <span className="text-muted-foreground">{invite.roleLabel}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              до {new Date(invite.expiresAt).toLocaleDateString("ru-RU")}
            </span>
            <Button variant="outline" size="sm" onClick={() => copy(invite.link)}>
              <CopyIcon />
              Ссылка
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => startTransition(async () => notify(await revokeInviteAction(projectId, invite.id)))}
            >
              Отозвать
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
