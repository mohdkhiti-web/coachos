"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Smooth expand/collapse with no JS height measurement (`collapse-grid` in motion.css: the grid row itself
 * tweens between `0fr` and `1fr`, which animates smoothly even though `auto`-sized content can't be animated
 * directly). Content stays in the DOM either way — this only ever changes how much of it is visible — so it is
 * safe around forms and anything else that must keep its state while hidden.
 */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-open={open} className={cn("collapse-grid", className)}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
