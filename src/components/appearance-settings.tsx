"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { GroupedRow, SettingsGroup } from "@/components/grouped-list";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "Auto" },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted ? (theme ?? "light") : "light";

  return (
    <SettingsGroup title="Appearance" footer="Auto follows the system appearance on this device.">
      <GroupedRow>
        <div className="w-full shrink-0 text-[15px] text-muted-foreground sm:w-[9.5rem]">Theme</div>
        <div className="min-w-0 flex-1">
          <div className="flex rounded-full bg-muted p-0.5">
            {OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={cn(
                  "flex-1 rounded-full px-3 py-1.5 text-[13px] transition-colors",
                  current === option.id
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </GroupedRow>
    </SettingsGroup>
  );
}
