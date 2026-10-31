"use client";

import { useTheme } from "next-themes";
import { LogOutIcon, MoonIcon, SunIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/(auth)/actions";

export type UserSummary = { name: string | null; email: string; avatarUrl: string | null; roleLabel: string };

export function initials(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0];
  const words = source.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function UserMenu({ user }: { user: UserSummary }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Меню пользователя">
          <Avatar className="size-7">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback className="text-xs">{initials(user.name, user.email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="grid font-normal">
          <span className="truncate font-medium">{user.name ?? user.email}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          <span className="text-xs text-muted-foreground">{user.roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setTheme(isDark ? "light" : "dark")}>
          {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          {isDark ? "Светлая тема" : "Тёмная тема"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOutIcon className="size-4" />
              Выйти
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
