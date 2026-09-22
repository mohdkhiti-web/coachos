import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A sheet of paper: raised surface, hairline border, soft paper shadow. `interactive` is for a card that is
 * itself a control (a drill card, a template tile, a clickable dashboard stat) — a touch of elevation on hover
 * and a small settle on press; a card that just holds content stays still.
 */
export function Card({
  className,
  interactive,
  ...props
}: React.ComponentProps<"section"> & { interactive?: boolean }) {
  return (
    <section
      className={cn(
        "rounded-lg border border-line bg-surface-raised shadow-paper",
        interactive && "interactive-surface",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn("space-y-1 border-b border-line px-5 py-4 sm:px-6", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2 className={cn("text-lg font-semibold tracking-tight text-ink", className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-ink-muted", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}
