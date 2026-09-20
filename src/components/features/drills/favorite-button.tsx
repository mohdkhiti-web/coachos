"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { setFavoriteAction } from "@/modules/drills/actions";

/**
 * Star a drill into the viewer's own favorites. A real toggle button (`aria-pressed`): it states the WANTED
 * state to the server (idempotent, so a double click cannot flip it back), updates immediately, and rolls
 * back with a message if the server says no. `card` is a round icon over the thumbnail; `detail` has a label.
 */
export function FavoriteButton({
  sportKey,
  drillId,
  title,
  initial,
  variant = "card",
}: {
  sportKey: string;
  drillId: string;
  title: string;
  initial: boolean;
  variant?: "card" | "detail";
}) {
  const t = useTranslations("drills.favorite");
  const te = useTranslations("errors");
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  // The server's answer (`initial`) is the truth; while a change is in flight the wanted state is shown at once.
  // If the server says no, the optimistic value simply falls back to the truth — nothing to undo by hand.
  const [favorite, setOptimistic] = React.useOptimistic(
    initial,
    (_current, wanted: boolean) => wanted,
  );

  function toggle() {
    const wanted = !favorite;
    startTransition(async () => {
      setOptimistic(wanted);
      const r = await setFavoriteAction(sportKey, drillId, wanted);
      if (r?.ok) return; // the action refreshed the workspace, so `initial` now matches
      const code = r && !r.ok ? r.error.code : "INTERNAL";
      toast(te.has(code) ? te(code) : te("generic"), "error");
    });
  }

  const icon = (
    <Star
      className={cn("size-5", favorite ? "fill-accent text-accent" : "text-ink-muted")}
      aria-hidden
    />
  );

  if (variant === "detail") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={favorite}
        aria-busy={pending}
        className="focus-visible:outline-focus inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-4 text-base font-medium text-ink transition-colors hover:border-accent focus-visible:outline-2"
      >
        {icon}
        {t("detailLabel")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={favorite}
      aria-busy={pending}
      aria-label={t("label", { title })}
      // above the card's stretched link (z-10), and a 44 px touch target
      className="focus-visible:outline-focus absolute top-2 right-2 z-10 inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface-raised/90 shadow-paper transition-colors hover:border-accent focus-visible:outline-2"
    >
      {icon}
    </button>
  );
}
