"use client";

import { DESK_MODES, type DeskMode } from "@/lib/desk-mode";
import { cn } from "@/lib/utils";

export function FocusControl({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: DeskMode;
  onChange: (mode: DeskMode) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const selected = DESK_MODES[value];

  return (
    <div className="grid gap-2">
      <div
        className={cn("flex rounded-full bg-muted p-0.5", compact ? "max-w-md" : "")}
        role="group"
        aria-label="Focus"
      >
        {(Object.keys(DESK_MODES) as DeskMode[]).map((id) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => {
                if (value !== id) onChange(id);
              }}
              className={cn(
                "min-h-11 min-w-0 flex-1 rounded-full px-2 py-2.5 text-[14px] transition-colors sm:min-h-0 sm:py-1.5 sm:text-[13px]",
                active
                  ? "bg-foreground font-semibold text-background shadow-sm"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {DESK_MODES[id].label}
            </button>
          );
        })}
      </div>
      <p className={cn("leading-relaxed text-muted-foreground", compact ? "text-[14px] sm:text-[12px]" : "text-[15px] sm:text-[13px]")}>
        <span className="font-medium text-foreground">Watching {selected.label}.</span>{" "}
        {selected.hint} {selected.sources}
      </p>
    </div>
  );
}
