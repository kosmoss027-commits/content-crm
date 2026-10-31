"use server";

import { redirect } from "next/navigation";
import { formText, runAction, type ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { acceptInvite } from "@/lib/db/invites";
import { prisma } from "@/lib/db/prisma";

export async function acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let workspaceId = "";
  const result = await runAction(async () => {
    const user = await requireUser();
    workspaceId = await acceptInvite(user, formText(formData, "token"));
  });
  if (!result?.ok) return result;

  const project = await prisma.project.findFirst({
    where: { workspaceId, archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  redirect(project ? `/p/${project.id}` : "/");
}
