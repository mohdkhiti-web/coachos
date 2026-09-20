"use client";

import * as React from "react";
import { Toast as T } from "radix-ui";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastItem = { id: number; tone: "success" | "error"; message: string };
type ToastApi = { toast: (message: string, tone?: ToastItem["tone"]) => void };

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({
  children,
  dismissLabel,
}: {
  children: React.ReactNode;
  dismissLabel: string;
}) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(0);

  const api = React.useMemo<ToastApi>(
    () => ({
      toast: (message, tone = "success") => {
        nextId.current += 1;
        const id = nextId.current;
        setItems((prev) => [...prev.slice(-2), { id, tone, message }]);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={api}>
      <T.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => (
          <T.Root
            key={item.id}
            onOpenChange={(open) => {
              if (!open) setItems((prev) => prev.filter((i) => i.id !== item.id));
            }}
            className={cn(
              "flex items-start gap-3 rounded-lg border bg-surface-raised p-4 shadow-paper data-[state=closed]:animate-out data-[state=open]:animate-in",
              item.tone === "success" ? "border-success" : "border-danger",
            )}
          >
            {item.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            )}
            <T.Description className="flex-1 text-sm font-medium text-ink">
              {item.message}
            </T.Description>
            <T.Close
              aria-label={dismissLabel}
              className="-m-1 rounded-md p-1 text-ink-muted hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </T.Close>
          </T.Root>
        ))}
        <T.Viewport className="fixed right-4 bottom-20 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none md:bottom-4" />
      </T.Provider>
    </ToastContext.Provider>
  );
}
