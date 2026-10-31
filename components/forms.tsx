"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/actions";

export function SubmitButton({ children, className, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} {...props}>
      {pending && <Loader2Icon className="animate-spin" />}
      {children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={cn("text-sm", state.ok ? "text-emerald-500" : "text-destructive")}>
      {state.message}
    </p>
  );
}

/** Показывает результат действия всплывающим уведомлением. */
export function notify(result: ActionState) {
  if (!result) return;
  if (result.ok) toast.success(result.message);
  else toast.error(result.message);
}

/** То же для форм с useActionState. */
export function useActionToast(state: ActionState) {
  useEffect(() => notify(state), [state]);
}

export function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
