"use client";

import { useSession } from "next-auth/react";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { displayIdentity } from "@/lib/phone";
import { cn } from "@/lib/utils";

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { data } = useSession();
  const user = data?.user;
  if (!user?.email) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2.5 rounded-xl text-left transition-colors hover:bg-muted",
          compact ? "p-0.5" : "w-full px-2 py-1.5",
        )}
      >
        {user.image ? (
          <img src={user.image} alt="" className="size-8 rounded-full ring-1 ring-border" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-amber-400/20 text-[12px] font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">
            {initials(user.name, user.email)}
          </span>
        )}
        {compact ? null : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-foreground">
              {displayIdentity(user.email, user.name)}
            </span>
            <span className="block truncate text-[12px] text-muted-foreground">SignlHQ</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} className="w-56 rounded-2xl">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-[13px] text-foreground">{displayIdentity(user.email, user.name)}</div>
          <div className="truncate text-[12px] text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            window.location.assign("/logout");
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
