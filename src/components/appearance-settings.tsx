"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { SettingsGroup, SettingsStackRow } from "@/components/grouped-list";
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
      <SettingsStackRow label="Theme">
        <div className="flex rounded-full bg-muted p-0.5">
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTheme(option.id)}
              className={cn(
                "min-h-11 flex-1 rounded-full px-3 text-[14px] transition-colors sm:min-h-0 sm:py-1.5 sm:text-[13px]",
                current === option.id
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </SettingsStackRow>
    </SettingsGroup>
  );
}
