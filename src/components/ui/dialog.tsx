"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  title,
  description,
  closeLabel,
  children,
  ...props
}: Omit<React.ComponentProps<typeof D.Content>, "title"> & {
  title: string;
  description?: string;
  closeLabel: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-out data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-surface-raised p-6 shadow-paper data-[state=closed]:animate-modal-out data-[state=open]:animate-modal-in",
          className,
        )}
        {...props}
      >
        <D.Title className="pr-8 text-lg font-semibold tracking-tight text-ink">{title}</D.Title>
        {description ? (
          <D.Description className="mt-1.5 text-sm text-ink-muted">{description}</D.Description>
        ) : (
          <D.Description className="sr-only">{title}</D.Description>
        )}
        <div className="mt-5">{children}</div>
        <D.Close
          aria-label={closeLabel}
          className="absolute top-3 right-3 inline-flex size-9 press items-center justify-center rounded-md text-ink-muted smooth-colors hover:bg-surface-sunken hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
