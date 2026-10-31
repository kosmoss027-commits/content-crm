"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { acceptInviteAction } from "@/app/invite/[token]/actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInviteAction, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton className="w-full">Принять приглашение</SubmitButton>
    </form>
  );
}
