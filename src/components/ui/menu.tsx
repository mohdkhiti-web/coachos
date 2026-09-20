"use client";

import * as React from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/cn";

/**
 * Non-modal on purpose: a modal dropdown `aria-hidden`s the rest of the page while its links stay
 * focusable (axe: aria-hidden-focus), and it needlessly locks scrolling. A non-modal menu still
 * closes on Escape / outside click and returns focus to its trigger.
 */
export function Menu(props: React.ComponentProps<typeof M.Root>) {
  return <M.Root modal={false} {...props} />;
}
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={8}
        align="end"
        className={cn(
          "z-50 min-w-56 rounded-lg border border-line bg-surface-raised p-1.5 shadow-paper data-[state=open]:animate-in",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

const itemBase =
  "flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-sunken";

export function MenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn(itemBase, className)} {...props} />;
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 py-2", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1.5 my-1.5 h-px bg-line", className)} {...props} />;
}
