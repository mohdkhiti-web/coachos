import type { DrillPhase, PlanStatus } from "@/db/enums";
import { cn } from "@/lib/cn";

/** The colour bar of a phase (a thin accent — the phase is always ALSO written out, never colour alone). */
export const PHASE_BAR: Record<DrillPhase | "break", string> = {
  warm_up: "bg-phase-warm-up",
  skill: "bg-phase-skill",
  small_sided: "bg-phase-small-sided",
  game: "bg-phase-game",
  conditioning: "bg-phase-conditioning",
  cool_down: "bg-phase-cool-down",
  break: "bg-phase-break",
};

const PHASE_DOT: Record<DrillPhase | "break", string> = PHASE_BAR;

/** "Warm-up", "Small-sided game"… with a colour dot. `label` is already translated. */
export function PhaseBadge({
  phase,
  label,
  className,
}: {
  phase: DrillPhase | "break";
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-ink",
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", PHASE_DOT[phase])} />
      {label}
    </span>
  );
}

const STATUS_STYLE: Record<PlanStatus | "deleted", string> = {
  draft: "border-line-strong bg-surface-sunken text-ink-muted",
  published: "border-success bg-success-soft text-ink",
  archived: "border-line-strong bg-surface text-ink-muted",
  deleted: "border-danger bg-danger-soft text-ink",
};

/** Draft · Published · Archived · Deleted — a word, never colour alone. */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: PlanStatus | "deleted";
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 eyebrow text-[0.7rem] tracking-[0.1em] whitespace-nowrap",
        STATUS_STYLE[status],
        className,
      )}
    >
      {label}
    </span>
  );
}
