import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SettingsGroup({
  title,
  accessory,
  children,
  footer,
  className,
}: {
  title?: string;
  accessory?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      {title || accessory ? (
        <div className="flex items-baseline justify-between gap-3 px-1">
          {title ? (
            <h2 className="text-[13px] font-normal tracking-[-0.01em] text-muted-foreground">{title}</h2>
          ) : (
            <span />
          )}
          {accessory ? (
            <div className="text-[13px] text-muted-foreground">{accessory}</div>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">{children}</div>
      {footer ? (
        <div className="px-4 text-[13px] leading-5 text-muted-foreground">{footer}</div>
      ) : null}
    </section>
  );
}

export function GroupedList({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <SettingsGroup footer={footer} className={className}>
      {children}
    </SettingsGroup>
  );
}

export function GroupedRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
