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
        "flex min-h-12 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsToggleRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <GroupedRow className="justify-between gap-4">
      <div className="min-w-0 text-[16px] leading-snug">{label}</div>
      <div className="shrink-0">{children}</div>
    </GroupedRow>
  );
}

export function SettingsStackRow({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <GroupedRow className="flex-col items-stretch gap-2.5 py-3.5">
      {label ? <div className="text-[16px] leading-snug">{label}</div> : null}
      {children}
    </GroupedRow>
  );
}
