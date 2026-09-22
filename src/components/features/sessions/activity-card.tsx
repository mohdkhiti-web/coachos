"use client";

/* eslint-disable react-hooks/refs -- dnd-kit's useSortable hands back callback refs, attributes and listeners that are meant to be spread onto elements during render; that is its documented API, and the rule cannot tell them from ordinary ref objects. */

import * as React from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Coffee,
  Copy,
  GripVertical,
  Lock,
  LockOpen,
  PenLine,
  Sparkles,
  Pencil,
  RefreshCw,
  Repeat,
  Trash2,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { FormatPill, IntensityMeter } from "@/components/features/drills/drill-badges";
import { DrillDiagram } from "@/components/features/drills/drill-diagram";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { formatOffset } from "@/modules/plans/schedule";
import type { BuilderActivity } from "./builder-model";
import { PHASE_BAR, PhaseBadge } from "./badges";

export type CardActions = {
  onMove: (id: string, delta: -1 | 1) => void;
  onEdit: (activity: BuilderActivity) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateFromSource: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  onEditDiagram: (activity: BuilderActivity) => void;
  /** Ask the AI assistant about this activity (only when the assistant is set up). */
  onAskAi?: (activity: BuilderActivity) => void;
};

/**
 * One block of the timeline. The time range is the visual anchor (00:00–10:00), the colour bar and the written
 * phase say what kind of block it is, and every action is a labelled button — moving up or down works without
 * dragging, and dragging works from the keyboard too. A break looks clearly different from a drill.
 */
export function ActivityCard({
  activity,
  startMin,
  endMin,
  index,
  count,
  replaceHref,
  canEdit,
  actions,
  leaving = false,
}: {
  activity: BuilderActivity;
  startMin: number;
  endMin: number;
  index: number;
  count: number;
  /** Where "Replace drill" goes (the drill picker for this activity). */
  replaceHref: string;
  canEdit: boolean;
  actions: CardActions;
  /** True while this card is playing its exit animation after being removed (see `useExitTransition`). */
  leaving?: boolean;
}) {
  const t = useTranslations("sessions.activity");
  const td = useTranslations("drills");
  const tc = useTranslations("common");
  const sortable = useSortable({ id: activity.id, disabled: !canEdit });
  const [confirm, setConfirm] = React.useState<"remove" | "update" | null>(null);
  const isBreak = activity.kind === "break";
  const isDrill = activity.kind === "drill";
  const headingId = `activity-${activity.id}-title`;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const hasFacts =
    !isBreak &&
    (activity.players !== null ||
      activity.repetitions !== null ||
      activity.format !== null ||
      activity.intensity !== null ||
      activity.category !== null);
  const bar = isBreak
    ? PHASE_BAR.break
    : activity.phase
      ? PHASE_BAR[activity.phase]
      : "bg-line-strong";

  const badges = (
    <div className="flex flex-wrap items-center gap-2">
      {isBreak ? (
        <PhaseBadge phase="break" label={t("breakLabel")} />
      ) : activity.phase ? (
        <PhaseBadge phase={activity.phase} label={td(`phases.${activity.phase}`)} />
      ) : null}
      {activity.locked ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-ink">
          <Lock className="size-3" aria-hidden />
          {t("locked")}
        </span>
      ) : null}
      {activity.customized ? (
        <span className="rounded-full border border-line-strong bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-ink">
          {t("customized")}
        </span>
      ) : null}
      {activity.source.status === "update_available" ? (
        <span className="rounded-full border border-warning bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-ink">
          {t("updateAvailable")}
        </span>
      ) : null}
      {isDrill && activity.source.status === "unavailable" ? (
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-muted">
          {t("sourceUnavailable")}
        </span>
      ) : null}
    </div>
  );

  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      id={`activity-${activity.id}`}
      aria-hidden={leaving || undefined}
      className={cn(
        "scroll-mt-28",
        sortable.isDragging && "relative z-20 opacity-90",
        leaving ? "pointer-events-none animate-out" : "animate-fade-up",
      )}
    >
      <article
        aria-labelledby={headingId}
        data-kind={activity.kind}
        className={cn(
          "flex overflow-hidden rounded-lg border shadow-paper transition-shadow duration-200 ease-out",
          isBreak
            ? "border-dashed border-line-strong bg-surface-sunken"
            : "border-line bg-surface-raised",
          sortable.isDragging && "ring-2 ring-accent",
          !leaving && "hover:shadow-lift",
        )}
      >
        <span aria-hidden className={cn("w-1.5 shrink-0", bar)} />

        <div className="flex min-w-0 flex-1 gap-2 p-3 sm:gap-3 sm:p-4">
          {canEdit ? (
            <button
              type="button"
              ref={sortable.setActivatorNodeRef}
              {...sortable.attributes}
              {...sortable.listeners}
              aria-label={t("drag", { title: activity.title })}
              className="flex h-11 w-9 shrink-0 press cursor-grab touch-none items-center justify-center rounded-md text-ink-muted smooth-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 active:cursor-grabbing"
            >
              <GripVertical className="size-5" aria-hidden />
            </button>
          ) : null}

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2 numeral text-lg leading-tight text-ink">
                  <span>
                    <span className="sr-only">{t("timeRange")} </span>
                    {formatOffset(startMin)}–{formatOffset(endMin)}
                  </span>
                  <span className="text-base text-ink-muted">
                    <span aria-hidden>·</span> {t("minutes", { count: activity.durationMin })}
                  </span>
                </p>
                <h3
                  id={headingId}
                  className={cn(
                    "mt-0.5 flex items-center gap-2 text-lg leading-snug font-semibold tracking-tight text-ink",
                  )}
                >
                  {isBreak ? (
                    <Coffee className="size-4 shrink-0 text-ink-muted" aria-hidden />
                  ) : null}
                  <span className="min-w-0 break-words">{activity.title}</span>
                </h3>
                <p className="sr-only">{t("position", { index: index + 1, count })}</p>
              </div>
              {badges}
            </div>

            {hasFacts ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
                {activity.players !== null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" aria-hidden />
                    {t("playersCount", { count: activity.players })}
                  </span>
                ) : null}
                {activity.repetitions !== null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Repeat className="size-4" aria-hidden />
                    {t("repetitionsCount", { count: activity.repetitions })}
                  </span>
                ) : null}
                {activity.format ? <FormatPill label={td(`formats.${activity.format}`)} /> : null}
                {activity.intensity ? (
                  <IntensityMeter
                    intensity={activity.intensity}
                    label={td(`intensities.${activity.intensity}`)}
                  />
                ) : null}
                {activity.category ? <span>{activity.category}</span> : null}
              </div>
            ) : null}

            {activity.notes ? (
              <p className="line-clamp-2 text-sm text-ink-muted">{activity.notes}</p>
            ) : null}

            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="px-3"
                  onClick={() => actions.onEdit(activity)}
                  aria-label={t("editTitle", { title: activity.title })}
                >
                  <Pencil className="size-4" aria-hidden />
                  {t("editShort")}
                </Button>
                <Button
                  id={`move-up-${activity.id}`}
                  type="button"
                  variant="secondary"
                  className="px-3"
                  disabled={index === 0}
                  onClick={() => actions.onMove(activity.id, -1)}
                  aria-label={t("moveUpTitle", { title: activity.title })}
                >
                  <ArrowUp className="size-4" aria-hidden />
                  {t("moveUp")}
                </Button>
                <Button
                  id={`move-down-${activity.id}`}
                  type="button"
                  variant="secondary"
                  className="px-3"
                  disabled={index === count - 1}
                  onClick={() => actions.onMove(activity.id, 1)}
                  aria-label={t("moveDownTitle", { title: activity.title })}
                >
                  <ArrowDown className="size-4" aria-hidden />
                  {t("moveDown")}
                </Button>
                {activity.source.status === "update_available" ? (
                  <Button type="button" variant="secondary" onClick={() => setConfirm("update")}>
                    <RefreshCw className="size-4" aria-hidden />
                    {t("updateFromLibrary")}
                  </Button>
                ) : null}
                <Menu>
                  <MenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t("moreTitle", { title: activity.title })}
                    >
                      {t("more")}
                      <ChevronDown className="size-4" aria-hidden />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    {isDrill ? (
                      <MenuItem asChild>
                        <Link href={replaceHref}>
                          <RefreshCw className="size-4" aria-hidden />
                          {t("replaceDrill")}
                        </Link>
                      </MenuItem>
                    ) : null}
                    {!isBreak ? (
                      <MenuItem onSelect={() => actions.onEditDiagram(activity)}>
                        <PenLine className="size-4" aria-hidden />
                        {activity.diagrams.length > 0 ? t("editDiagram") : t("addDiagram")}
                      </MenuItem>
                    ) : null}
                    {actions.onAskAi ? (
                      <MenuItem onSelect={() => actions.onAskAi?.(activity)}>
                        <Sparkles className="size-4" aria-hidden />
                        {t("askAi")}
                      </MenuItem>
                    ) : null}
                    <MenuItem onSelect={() => actions.onToggleLock(activity.id, !activity.locked)}>
                      {activity.locked ? (
                        <LockOpen className="size-4" aria-hidden />
                      ) : (
                        <Lock className="size-4" aria-hidden />
                      )}
                      {activity.locked ? t("unlock") : t("lock")}
                    </MenuItem>
                    <MenuItem onSelect={() => actions.onDuplicate(activity.id)}>
                      <Copy className="size-4" aria-hidden />
                      {t("duplicate")}
                    </MenuItem>
                    <MenuItem onSelect={() => setConfirm("remove")}>
                      <Trash2 className="size-4 text-danger" aria-hidden />
                      {t("remove")}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            ) : null}
          </div>

          {activity.diagram ? (
            <div className="hidden w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-sunken min-[440px]:flex sm:w-28">
              <DrillDiagram diagram={activity.diagram} decorative className="h-full w-full p-0.5" />
            </div>
          ) : null}
        </div>
      </article>

      <Dialog open={confirm === "remove"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent
          title={t("removeTitle")}
          description={t("removeBody", { title: activity.title })}
          closeLabel={tc("close")}
        >
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {tc("cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setConfirm(null);
                actions.onRemove(activity.id);
              }}
            >
              {t("removeConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm === "update"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent
          title={t("updateTitle")}
          description={
            activity.customized
              ? t("updateBodyCustomized", { title: activity.title })
              : t("updateBody", { title: activity.title })
          }
          closeLabel={tc("close")}
        >
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {tc("cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                setConfirm(null);
                actions.onUpdateFromSource(activity.id);
              }}
            >
              {t("updateConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
