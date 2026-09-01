"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { data } = useSession();
  const user = data?.user;
  if (!user?.email) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-sidebar-accent/60 md:justify-start">
        {user.image ? (
          <img src={user.image} alt="" className="size-6 rounded-full ring-1 ring-border" />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full bg-amber-500/20 font-mono text-[10px] text-amber-200">
            {initials(user.name, user.email)}
          </span>
        )}
        <span className="hidden min-w-0 flex-1 md:block">
          <span className="block truncate text-[12px] text-foreground">{user.name || user.email}</span>
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {user.role === "admin" ? "Admin" : "Operator"}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-xs text-foreground">{user.email}</div>
          <div className="text-[11px] text-muted-foreground">
            Shared desk · {user.role === "admin" ? "admin" : "operator"}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            void signOut({ callbackUrl: "/login" });
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
