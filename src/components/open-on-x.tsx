import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OpenOnX({
  href,
  size = "default",
  className,
}: {
  href: string;
  size?: "default" | "lg" | "row";
  className?: string;
}) {
  const large = size === "lg";
  const row = size === "row";
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={cn(
        buttonVariants({
          size: large ? "lg" : "sm",
          variant: large ? "default" : "outline",
        }),
        "rounded-full no-underline",
        row && "h-11 min-h-11 flex-1 text-[15px] sm:h-8 sm:min-h-8 sm:flex-none sm:text-[13px]",
        large && "h-12 w-full min-h-12 text-[16px]",
        className,
      )}
    >
      Open on X
      <ExternalLink className={large ? "size-4" : "size-3.5"} />
    </a>
  );
}
