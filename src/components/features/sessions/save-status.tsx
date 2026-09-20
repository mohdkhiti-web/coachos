"use client";

import { CheckCircle2, CircleAlert, Loader2, PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type SaveState = "saved" | "saving" | "unsaved" | "invalid" | "error" | "conflict";

/**
 * A quiet, always-visible answer to "is my work safe?": Saved · Saving… · Unsaved changes · Fix the highlighted
 * fields · Couldn't save (with a retry) · Changed elsewhere (with a reload). A polite live region, so a screen
 * reader hears the change without being interrupted.
 */
export function SaveStatus({
  state,
  onRetry,
  onReload,
  className,
}: {
  state: SaveState;
  onRetry?: () => void;
  onReload?: () => void;
  className?: string;
}) {
  const t = useTranslations("sessions.builder.save");
  const Icon =
    state === "saved"
      ? CheckCircle2
      : state === "saving"
        ? Loader2
        : state === "unsaved"
          ? PencilLine
          : CircleAlert;
  return (
    <div
      role="status"
      aria-live="polite"
      data-state={state}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 text-sm",
        state === "error" || state === "conflict" || state === "invalid"
          ? "font-medium text-danger"
          : "text-ink-muted",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          state === "saving" && "animate-spin",
          state === "saved" && "text-success",
        )}
      />
      <span>{t(state)}</span>
      {state === "error" && onRetry ? (
        <Button type="button" variant="link" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
      {state === "conflict" && onReload ? (
        <Button type="button" variant="link" size="sm" onClick={onReload}>
          {t("reload")}
        </Button>
      ) : null}
    </div>
  );
}
