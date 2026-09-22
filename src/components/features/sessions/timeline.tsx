"use client";

import * as React from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";
import { useExitTransition } from "@/components/motion";
import type { OnTimeline } from "@/modules/plans/schedule";
import type { BuilderActivity } from "./builder-model";
import { ActivityCard, type CardActions } from "./activity-card";

/**
 * The timeline: the main visual element of the builder. Blocks reorder by dragging (mouse, touch with a short
 * press, or the keyboard: Space to lift, arrows to move, Space to drop) AND by the Up/Down buttons on each card,
 * so dragging is never the only way. Every change is announced to screen readers.
 */
export function Timeline({
  items,
  canEdit,
  replaceHrefFor,
  actions,
  onReorder,
  empty,
}: {
  items: OnTimeline<BuilderActivity>[];
  canEdit: boolean;
  replaceHrefFor: (activityId: string) => string;
  actions: CardActions;
  onReorder: (orderedIds: string[], movedId: string) => void;
  /** Shown when there is nothing yet. */
  empty: React.ReactNode;
}) {
  const t = useTranslations("sessions.builder");
  const ids = items.map((a) => a.id);
  const titleOf = (id: string | number) => items.find((a) => a.id === id)?.title ?? "";
  const indexOf = (id: string | number) => ids.indexOf(String(id)) + 1;
  // Removed blocks fade out instead of vanishing; the list below stays mounted for `wait` ms after removal so
  // the exit animation (motion.css `animate-out`) can play. Added blocks are simply new keys, which the card's
  // own `animate-fade-up` mount animation already covers.
  const transitioned = useExitTransition(items, (a) => a.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // on a phone or tablet: a short press on the handle lifts the block, so scrolling is never hijacked
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("dnd.start", { title: titleOf(active.id), position: indexOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("dnd.over", {
            title: titleOf(active.id),
            position: indexOf(over.id),
            count: ids.length,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("dnd.end", { title: titleOf(active.id), position: indexOf(over.id), count: ids.length })
        : t("dnd.cancel", { title: titleOf(active.id) }),
    onDragCancel: ({ active }) => t("dnd.cancel", { title: titleOf(active.id) }),
  };

  function dragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to), String(active.id));
  }

  if (transitioned.length === 0) return <>{empty}</>;

  return (
    <DndContext
      id="session-timeline"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={dragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("dnd.instructions") },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol aria-label={t("timelineLabel")} className="space-y-3">
          {transitioned.map(({ key, item: a, leaving }, i) => (
            <ActivityCard
              key={key}
              activity={a}
              startMin={a.startMin}
              endMin={a.endMin}
              index={i}
              count={items.length}
              replaceHref={replaceHrefFor(a.id)}
              canEdit={canEdit && !leaving}
              actions={actions}
              leaving={leaving}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
