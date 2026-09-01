import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-8 py-16 text-center",
        className,
      )}
    >
      <p className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/90">
        {title}
      </p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[15px] leading-snug text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
