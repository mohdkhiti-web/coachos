"use client";

import * as React from "react";
import { Tooltip as TT } from "radix-ui";

export const TooltipProvider = TT.Provider;

/** Names an icon-only control for sighted users on hover/focus (the control itself keeps an aria-label). */
export function Tooltip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <TT.Root delayDuration={250}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content
          sideOffset={6}
          className="z-50 rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-surface shadow-paper"
        >
          {label}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}
