"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  Coffee,
  Copy,
  FileCheck2,
  ListPlus,
  MoreHorizontal,
  PencilLine,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { PLAN_LIMITS, type PlanStatus } from "@/db/enums";
import { cn } from "@/lib/cn";
import type { Result } from "@/lib/result";
import {
  addBreakAction,
  addCustomActivityAction,
  deletePlanAction,
  duplicateActivityAction,
  duplicatePlanAction,
  removeActivityAction,
  reorderActivitiesAction,
  replaceActivityDrillAction,
  setPlanStatusAction,
  updateActivityAction,
  updatePlanAction,
} from "@/modules/plans/actions";
import { formatDateOnly, formatClockTime } from "@/modules/plans/format";
import { ActivityDialog, type ActivityDialogMode } from "./activity-dialog";
import type { CardActions } from "./activity-card";
import { StatusBadge } from "./badges";
import {
  applyEdit,
  moveTarget,
  summarize,
  type ActivityPatch,
  type BuilderActivity,
  type BuilderPlan,
  type Edit,
} from "./builder-model";
import { SaveStatus, type SaveState } from "./save-status";
import { SessionFields, type SessionCatalog } from "./session-fields";
import {
  fieldsFromServer,
  toPayload,
  validateSession,
  valuesKey,
  type FieldErrors,
  type SessionFormValues,
} from "./session-model";
import { Timeline } from "./timeline";
import { TotalsBar } from "./totals-bar";
import { useMutationQueue } from "./use-mutation-queue";

/** How long the details form waits after the last keystroke before saving. Long enough to be one request, short enough to feel safe. */
const AUTOSAVE_MS = 900;

/**
 * The session builder: the coach's clipboard. The timeline is the main thing; the session's details sit beside it
 * (or behind one button on a phone). Everything a coach does is applied on screen at once and confirmed by the
 * server a moment later, through ONE queue so requests never overlap. Totals and the end time are the shared,
 * server-identical calculation — nothing here computes timing of its own.
 */
export function SessionBuilder({
  sportKey,
  plan,
  initialValues,
  catalog,
  showVisibility,
  backLabel,
}: {
  sportKey: string;
  plan: BuilderPlan;
  initialValues: SessionFormValues;
  catalog: SessionCatalog;
  showVisibility: boolean;
  /** The back link's text ("My Sessions"). */
  backLabel: string;
}) {
  const t = useTranslations("sessions.builder");
  const ts = useTranslations("sessions");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const queue = useMutationQueue(plan.version);
  const { observe } = queue;
  const [pendingUi, startTransition] = React.useTransition();

  // ---- the details form -------------------------------------------------------------------------
  const [values, setValues] = React.useState(initialValues);
  const [savedKey, setSavedKey] = React.useState(() => valuesKey(initialValues));
  const [serverErrors, setServerErrors] = React.useState<FieldErrors>({});
  const localErrors = React.useMemo(() => validateSession(values), [values]);
  const errors = { ...serverErrors, ...localErrors };
  const invalid = Object.keys(localErrors).length > 0;
  const dirty = valuesKey(values) !== savedKey;
  const canEdit = plan.canEdit;
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  // ---- the timeline (optimistic) ----------------------------------------------------------------
  const [view, applyOptimistic] = React.useOptimistic(plan.activities, applyEdit);
  const [dialog, setDialog] = React.useState<ActivityDialogMode | null>(null);
  // The dialog has no trigger element of its own, so remember what opened it and give focus back when it closes.
  const opener = React.useRef<HTMLElement | null>(null);
  const openDialog = (mode: ActivityDialogMode) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(mode);
  };
  const [announcement, setAnnouncement] = React.useState("");
  const focusTarget = React.useRef<string | null>(null);

  React.useEffect(() => {
    observe(plan.version); // never let the queue fall behind a version the server has shown us
  }, [plan.version, observe]);

  const targetMinutes = Number(values.targetMinutes);
  const summary = summarize(view, {
    targetMinutes: Number.isFinite(targetMinutes) ? targetMinutes : 0,
    scheduledDate: values.scheduledDate || null,
    startTime: values.startTime || null,
    timezone: values.timezone || null,
  });

  // after a move, keep the keyboard where the coach was (React moves the node; focus would otherwise be lost)
  const orderKey = view.map((a) => a.id).join(",");
  React.useEffect(() => {
    const id = focusTarget.current;
    if (!id) return;
    focusTarget.current = null;
    const el = document.getElementById(id) as HTMLButtonElement | null;
    // at the end of the list the button that was just used is disabled: land on its opposite instead
    const opposite = id.startsWith("move-up-")
      ? "move-down-" + id.slice("move-up-".length)
      : "move-up-" + id.slice("move-down-".length);
    (el && !el.disabled ? el : document.getElementById(opposite))?.focus();
  }, [orderKey]);

  const errorText = (r: Result<unknown>) => {
    const code = r && !r.ok ? r.error.code : "INTERNAL";
    return te.has(code) ? te(code) : te("generic");
  };

  /** Run a timeline change: apply it on screen now, queue the real one, and say so if the server refuses. */
  function run<T extends { version: number }>(
    edit: Edit | null,
    call: (version: number) => Promise<Result<T>>,
    ok?: (data: T) => void,
  ): Promise<Result<T>> {
    return new Promise((resolve) => {
      startTransition(async () => {
        if (edit) applyOptimistic(edit);
        const result = await queue.enqueue(call);
        if (result.ok) ok?.(result.data);
        else if (result.error.code === "VALIDATION") {
          const f = result.error.fields;
          toast(
            f?.durationMin?.includes("session_too_long")
              ? t("errors.tooLong")
              : f?.activities
                ? t("errors.tooMany")
                : te("VALIDATION"),
            "error",
          );
        } else if (result.error.code !== "CONFLICT") toast(errorText(result), "error"); // a conflict has its own banner
        resolve(result);
      });
    });
  }

  const reorder = (orderedIds: string[], announce?: string) => {
    void run({ type: "reorder", orderedIds }, (v) =>
      reorderActivitiesAction(sportKey, plan.id, { orderedIds, version: v }),
    );
    if (announce) setAnnouncement(announce);
  };

  const actions: CardActions = {
    onMove: (id, delta) => {
      const to = moveTarget(view, id, delta);
      if (to === null) return;
      const next = applyEdit(view, { type: "move", id, delta });
      const title = view.find((a) => a.id === id)?.title ?? "";
      focusTarget.current = `${delta < 0 ? "move-up" : "move-down"}-${id}`;
      reorder(
        next.map((a) => a.id),
        t("announce.moved", { title, position: to + 1, count: view.length }),
      );
    },
    onEdit: (activity) => openDialog({ kind: "edit", activity }),
    onDuplicate: (id) => {
      void run(
        null,
        (v) => duplicateActivityAction(sportKey, plan.id, id, v),
        () => {
          toast(t("toast.duplicated"), "success");
          setAnnouncement(t("announce.duplicated"));
        },
      );
    },
    onRemove: (id) => {
      const title = view.find((a) => a.id === id)?.title ?? "";
      focusTarget.current = "add-drill-button";
      void run(
        { type: "remove", id },
        (v) => removeActivityAction(sportKey, plan.id, id, v),
        () => setAnnouncement(t("announce.removed", { title })),
      );
    },
    onUpdateFromSource: (id) => {
      void run(
        null,
        (v) =>
          replaceActivityDrillAction(sportKey, plan.id, id, {
            version: v,
            changeReason: t("updatedFromLibrary"),
          }),
        () => toast(t("toast.updatedFromLibrary"), "success"),
      );
    },
  };

  const patchFrom = (a: BuilderActivity, body: Record<string, unknown>): ActivityPatch => {
    const patch: ActivityPatch = {};
    if (typeof body.title === "string") patch.title = body.title;
    if ("phase" in body && a.kind !== "break")
      patch.phase = (body.phase as BuilderActivity["phase"]) ?? null;
    if (typeof body.durationMin === "number") patch.durationMin = body.durationMin;
    if ("players" in body && a.kind !== "break")
      patch.players = (body.players as number | null) ?? null;
    if ("repetitions" in body && a.kind !== "break")
      patch.repetitions = (body.repetitions as number | null) ?? null;
    if (typeof body.notes === "string") patch.notes = body.notes;
    if (body.content && a.kind === "custom")
      patch.custom = body.content as NonNullable<BuilderActivity["custom"]>;
    return patch;
  };

  const submitDialog = (mode: ActivityDialogMode, body: Record<string, unknown>) => {
    if (mode.kind === "edit") {
      const a = mode.activity;
      return run({ type: "update", id: a.id, patch: patchFrom(a, body) }, (v) =>
        updateActivityAction(sportKey, plan.id, a.id, { ...body, version: v }),
      );
    }
    const add = mode.kind === "custom" ? addCustomActivityAction : addBreakAction;
    return run(
      null,
      (v) => add(sportKey, plan.id, { ...body, version: v }),
      () => {
        toast(mode.kind === "custom" ? t("toast.customAdded") : t("toast.breakAdded"), "success");
        setAnnouncement(t("announce.added"));
      },
    );
  };

  // ---- autosave of the details -------------------------------------------------------------------
  const saveDetails = React.useCallback(() => {
    const snapshot = values;
    const key = valuesKey(snapshot);
    startTransition(async () => {
      const result = await queue.enqueue((v) =>
        updatePlanAction(sportKey, plan.id, toPayload(snapshot, v)),
      );
      if (result.ok) {
        setSavedKey(key);
        setServerErrors({});
        return;
      }
      if (result.error.code === "VALIDATION")
        setServerErrors(fieldsFromServer(result.error.fields));
      else if (result.error.code !== "CONFLICT") toast(errorText(result), "error");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, queue.enqueue, sportKey, plan.id]);

  React.useEffect(() => {
    if (!canEdit || !dirty || invalid || queue.failure) return;
    const timer = window.setTimeout(saveDetails, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [saveDetails, dirty, invalid, canEdit, queue.failure]);

  // save right away when the coach leaves the tab (a phone going to sleep must not lose the last edits)
  React.useEffect(() => {
    if (!canEdit) return;
    const onHide = () => {
      if (document.visibilityState === "hidden" && dirty && !invalid && !queue.failure)
        saveDetails();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if ((dirty && !invalid) || queue.pending > 0) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [canEdit, dirty, invalid, queue.failure, queue.pending, saveDetails]);

  const saveState: SaveState =
    queue.failure === "CONFLICT"
      ? "conflict"
      : queue.failure === "ERROR"
        ? "error"
        : queue.pending > 0
          ? "saving"
          : invalid
            ? "invalid"
            : dirty
              ? "unsaved"
              : "saved";

  // ---- the session's own actions -----------------------------------------------------------------
  const [confirm, setConfirm] = React.useState<"delete" | null>(null);
  const listHref = `/sessions/${sportKey}`;

  const setStatus = (status: PlanStatus, doneKey: string) => {
    void run(
      null,
      (v) => setPlanStatusAction(sportKey, plan.id, status, v),
      () => {
        toast(t(doneKey), "success");
        router.refresh();
      },
    );
  };
  const duplicateSession = () => {
    startTransition(async () => {
      const r = await duplicatePlanAction(sportKey, plan.id);
      if (r?.ok) {
        toast(ts("actions.duplicated"), "success");
        router.push(`${listHref}/${r.data.id}`);
      } else toast(errorText(r), "error");
    });
  };
  const deleteSession = () => {
    startTransition(async () => {
      const r = await deletePlanAction(sportKey, plan.id);
      if (r?.ok) {
        toast(ts("actions.deleted"), "success");
        router.push(listHref);
      } else toast(errorText(r), "error");
    });
  };

  const objectiveName = (key: string) => catalog.objectives.find((o) => o.key === key)?.name ?? key;
  const otherMinutes = (id?: string) =>
    view.filter((a) => a.id !== id).reduce((sum, a) => sum + a.durationMin, 0);
  const atLimit = view.length >= PLAN_LIMITS.maxActivities;
  const addHref = `${listHref}/${plan.id}/drills`;
  const status = plan.status;
  const summaryBits = [
    values.teamName,
    catalog.ageGroups.find((g) => g.key === values.ageGroup)?.name,
    values.scheduledDate ? formatDateOnly(values.scheduledDate, locale) : null,
    values.startTime ? formatClockTime(values.startTime, locale) : null,
    values.players ? t("playersSummary", { count: Number(values.players) || 0 }) : null,
    values.location,
  ].filter(Boolean) as string[];

  const addButtons = canEdit ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        asChild
        size="lg"
        aria-disabled={atLimit}
        className={atLimit ? "pointer-events-none opacity-55" : undefined}
      >
        <Link id="add-drill-button" href={addHref}>
          <Plus className="size-5" aria-hidden />
          {t("addDrill")}
        </Link>
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        disabled={atLimit}
        onClick={() => openDialog({ kind: "custom" })}
      >
        <ListPlus className="size-5" aria-hidden />
        {t("addCustom")}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        disabled={atLimit}
        onClick={() => openDialog({ kind: "break" })}
      >
        <Coffee className="size-5" aria-hidden />
        {t("addBreak")}
      </Button>
    </div>
  ) : null;

  return (
    <div className="space-y-6" aria-busy={pendingUi}>
      <header className="space-y-4">
        <Link
          href={listHref}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xs text-sm font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="min-w-0 display text-4xl break-words text-ink md:text-5xl">
                {values.title.trim() || t("untitled")}
              </h1>
              <StatusBadge status={status} label={ts(`status.${status}`)} />
            </div>
            {summaryBits.length > 0 ? (
              <p className="text-sm text-ink-muted">{summaryBits.join(" · ")}</p>
            ) : null}
            {values.primaryObjective ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="eyebrow">{ts("card.mainObjective")}</span>
                <span className="rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 font-medium text-ink">
                  {objectiveName(values.primaryObjective)}
                </span>
                {values.secondaryObjectives.map((k) => (
                  <span
                    key={k}
                    className="rounded-full border border-line-strong px-2.5 py-0.5 text-ink-muted"
                  >
                    {objectiveName(k)}
                  </span>
                ))}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canEdit ? (
              <SaveStatus
                state={saveState}
                onRetry={() => {
                  queue.clearFailure();
                  if (dirty && !invalid) saveDetails();
                }}
                onReload={() => window.location.reload()}
              />
            ) : null}
            {(canEdit || plan.canDelete) && (
              <Menu>
                <MenuTrigger asChild>
                  <Button type="button" variant="secondary" aria-label={t("sessionActions")}>
                    <MoreHorizontal className="size-4" aria-hidden />
                    {t("sessionActionsShort")}
                    <ChevronDown className="size-4" aria-hidden />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {canEdit && status === "draft" ? (
                    <MenuItem onSelect={() => setStatus("published", "toast.published")}>
                      <FileCheck2 className="size-4" aria-hidden />
                      {t("markFinal")}
                    </MenuItem>
                  ) : null}
                  {canEdit && status === "published" ? (
                    <MenuItem onSelect={() => setStatus("draft", "toast.backToDraft")}>
                      <PencilLine className="size-4" aria-hidden />
                      {t("backToDraft")}
                    </MenuItem>
                  ) : null}
                  <MenuItem onSelect={duplicateSession}>
                    <Copy className="size-4" aria-hidden />
                    {ts("actions.duplicate")}
                  </MenuItem>
                  {plan.canDelete && status !== "archived" ? (
                    <MenuItem onSelect={() => setStatus("archived", "toast.archived")}>
                      <Archive className="size-4" aria-hidden />
                      {ts("actions.archive")}
                    </MenuItem>
                  ) : null}
                  {plan.canDelete && status === "archived" ? (
                    <MenuItem onSelect={() => setStatus("draft", "toast.restored")}>
                      <RotateCcw className="size-4" aria-hidden />
                      {ts("actions.restoreArchive")}
                    </MenuItem>
                  ) : null}
                  {plan.canDelete ? (
                    <>
                      <MenuSeparator />
                      <MenuItem onSelect={() => setConfirm("delete")}>
                        <Trash2 className="size-4 text-danger" aria-hidden />
                        {ts("actions.delete")}
                      </MenuItem>
                    </>
                  ) : null}
                </MenuContent>
              </Menu>
            )}
          </div>
        </div>

        {!canEdit ? (
          <p
            role="note"
            className="rounded-md border border-line-strong bg-surface-sunken px-4 py-3 text-sm text-ink"
          >
            {status === "archived" ? t("readOnlyArchived") : t("readOnly")}
          </p>
        ) : null}
        {queue.failure === "CONFLICT" ? (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm font-medium text-ink"
          >
            {t("conflictBanner")}{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => window.location.reload()}
            >
              {t("save.reload")}
            </button>
          </p>
        ) : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <section aria-labelledby="timeline-heading" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="timeline-heading" className="eyebrow">
              {t("timeline")}
            </h3>
            <Button
              type="button"
              variant="secondary"
              className="lg:hidden"
              aria-expanded={detailsOpen}
              aria-controls="session-details"
              onClick={() => setDetailsOpen((o) => !o)}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {t("details")}
            </Button>
          </div>

          {addButtons}
          {atLimit ? (
            <p className="text-sm text-warning" role="note">
              {t("errors.tooMany")}
            </p>
          ) : null}

          <Timeline
            items={summary.timeline}
            canEdit={canEdit}
            replaceHrefFor={(id) => `${listHref}/${plan.id}/replace/${id}`}
            actions={actions}
            onReorder={(ids, movedId) => {
              const moved = view.find((a) => a.id === movedId);
              reorder(ids, moved ? t("announce.reordered", { title: moved.title }) : undefined);
            }}
            empty={
              <div className="rounded-lg border border-dashed border-line-strong">
                <EmptyState
                  title={t("emptyTitle")}
                  description={canEdit ? t("emptyBody") : t("emptyReadOnly")}
                  action={
                    canEdit ? (
                      <Button asChild size="lg">
                        <Link id="add-drill-button" href={addHref}>
                          <Plus className="size-5" aria-hidden />
                          {t("addDrill")}
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            }
          />
        </section>

        <aside
          id="session-details"
          aria-label={t("details")}
          className={cn(
            detailsOpen ? "block" : "hidden",
            "lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto",
          )}
        >
          <Card>
            <CardBody>
              <SessionFields
                values={values}
                onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
                errors={errors}
                catalog={catalog}
                showVisibility={showVisibility}
                disabled={!canEdit}
                compact
              />
            </CardBody>
          </Card>
        </aside>
      </div>

      <TotalsBar
        className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 md:bottom-4"
        total={summary.totalMinutes}
        target={Number.isFinite(targetMinutes) ? targetMinutes : 0}
        remaining={summary.remainingMinutes}
        endTime={summary.schedule?.endTime ?? null}
        endsNextDay={summary.schedule?.endsNextDay ?? false}
      />

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {dialog ? (
        <ActivityDialog
          key={dialog.kind === "edit" ? dialog.activity.id : dialog.kind}
          mode={dialog}
          onClose={() => setDialog(null)}
          returnFocus={() => opener.current?.focus()}
          otherMinutes={otherMinutes(dialog.kind === "edit" ? dialog.activity.id : undefined)}
          onSubmit={(body) => submitDialog(dialog, body)}
        />
      ) : null}

      <Dialog open={confirm === "delete"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent
          title={ts("actions.deleteTitle")}
          description={ts("actions.deleteBody", { title: values.title || t("untitled") })}
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
                deleteSession();
              }}
            >
              {ts("actions.deleteConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
