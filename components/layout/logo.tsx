import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-6 place-items-center rounded-md bg-indigo-500 text-xs font-bold text-white">C</span>
      <span>Content CRM</span>
    </div>
  );
}
