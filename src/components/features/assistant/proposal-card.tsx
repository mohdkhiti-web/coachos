"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, CircleAlert, Loader2, Sparkles } from "lucide-react";
import { DrillDiagram } from "@/components/features/drills/drill-diagram";
import { PhaseBadge } from "@/components/features/sessions/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import type { DrillPhase } from "@/db/enums";
import { isDestructive, type Proposal } from "@/modules/assistant/proposals";

/**
 * One suggestion from the assistant, as a card the coach can read and act on: what would change, in words and (for a diagram)
 * as a picture, and exactly one clear button. Nothing here changes anything by itself: "Apply" asks the server, which checks the
 * suggestion against the session as it is now. A suggestion that removes or replaces something asks for confirmation first.
 */

const BUTTON: Record<Proposal["kind"], string> = {
  create_session: "createSession",
  add_drill: "addDrill",
  replace_drill: "replaceDrill",
  remove_activity: "apply",
  update_activity: "apply",
  reorder_activity: "apply",
  set_durations: "apply",
  update_plan: "apply",
  add_custom: "apply",
  add_break: "apply",
  set_diagram: "createDiagram",
};

export function ProposalCard({
  sportKey,
  proposal,
  busy,
  onApply,
  onDismiss,
}: {
  sportKey: string;
  proposal: Proposal;
  busy: boolean;
  onApply: (confirmed: boolean) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("assistant.proposal");
  const tph = useTranslations("drills.phases");
  const tc = useTranslations("common");
  const [confirming, setConfirming] = React.useState(false);
  const destructive = isDestructive(proposal);
  const pending = proposal.status === "pending";
  const sessionHref = (id: string) => `/sessions/${sportKey}/${id}`;

  const phase = (p: DrillPhase | null) => (p ? <PhaseBadge phase={p} label={tph(p)} /> : null);

  const details = (() => {
    switch (proposal.kind) {
      case "create_session":
        return (
          <div className="space-y-2">
            <p className="text-sm text-ink-muted">
              {t("create.summary", {
                minutes: proposal.requirements.durationMin,
                players: proposal.requirements.players,
                count: proposal.items.filter((i) => i.kind === "drill").length,
              })}
            </p>
            <ol className="divide-y divide-line rounded-md border border-line">
              {proposal.items.map((i, at) => (
                <li key={at} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  {i.kind === "break" ? (
                    <PhaseBadge phase="break" label={t("breakLabel")} />
                  ) : (
                    phase(i.phase)
                  )}
                  <span className="min-w-0 flex-1 font-medium text-ink">
                    {i.kind === "break" ? t("breakTitle") : i.title}
                  </span>
                  <span className="numeral text-ink-muted">
                    {t("minutes", { count: i.durationMin })}
                  </span>
                </li>
              ))}
            </ol>
            {proposal.issues.filter((i) => i.severity === "warning").length > 0 ? (
              <p className="text-sm text-ink-muted">
                {t("create.warnings", {
                  count: proposal.issues.filter((i) => i.severity === "warning").length,
                })}
              </p>
            ) : null}
          </div>
        );
      case "add_drill":
        return (
          <p className="text-sm text-ink">
            {t("add.body", { title: proposal.title, minutes: proposal.durationMin })}
          </p>
        );
      case "replace_drill":
        return (
          <p className="text-sm text-ink">
            {t("replace.body", { from: proposal.activityTitle, to: proposal.title })}
          </p>
        );
      case "remove_activity":
        return <p className="text-sm text-ink">{t("remove.body", { title: proposal.title })}</p>;
      case "update_activity":
        return (
          <div className="space-y-1 text-sm text-ink">
            <p>{t("update.body", { title: proposal.title })}</p>
            <ul className="list-disc pl-5 text-ink-muted">
              {Object.entries(proposal.patch).map(([field, value]) => (
                <li key={field}>
                  {t.has(`fields.${field}`) ? t(`fields.${field}`) : field}:{" "}
                  {value === null ? t("none") : String(value)}
                </li>
              ))}
            </ul>
          </div>
        );
      case "reorder_activity":
        return (
          <p className="text-sm text-ink">
            {t("reorder.body", { title: proposal.title, position: proposal.toPosition + 1 })}
          </p>
        );
      case "set_durations":
        return (
          <ul className="divide-y divide-line rounded-md border border-line text-sm">
            {proposal.changes.map((c) => (
              <li key={c.activityId} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 text-ink">{c.title}</span>
                <span className="numeral text-ink-muted">
                  {t("durationChange", { from: c.from, to: c.to })}
                </span>
              </li>
            ))}
          </ul>
        );
      case "update_plan":
        return (
          <div className="space-y-1 text-sm text-ink">
            {proposal.players !== undefined ? (
              <p>{t("plan.players", { count: proposal.players })}</p>
            ) : null}
            {proposal.primaryObjective ? (
              <p>
                {t("plan.objective", { objective: proposal.primaryObjective.replaceAll("_", " ") })}
              </p>
            ) : null}
            {proposal.issues.length > 0 ? (
              <ul className="list-disc pl-5 text-ink-muted">
                {proposal.issues.map((i, at) => (
                  <li key={at}>
                    {t(`playersIssue.${i.code === "equipment_short" ? "equipment" : "players"}`, {
                      title: String(i.values?.title ?? ""),
                    })}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      case "add_custom":
        return (
          <div className="space-y-1 text-sm text-ink">
            <p className="font-medium">{proposal.title}</p>
            <p className="text-ink-muted">{proposal.description}</p>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-ink">
              <Sparkles className="size-3" aria-hidden />
              {t("custom.label")}
            </p>
          </div>
        );
      case "add_break":
        return (
          <p className="text-sm text-ink">
            {t("addBreak.body", { minutes: proposal.durationMin })}
          </p>
        );
      case "set_diagram":
        return (
          <div className="space-y-2">
            <p className="text-sm text-ink">
              {proposal.replacing
                ? t("diagram.replace", { title: proposal.title })
                : t("diagram.create", { title: proposal.title })}
            </p>
            <div className="max-w-sm overflow-hidden rounded-md border border-line bg-surface-sunken">
              <DrillDiagram
                diagram={proposal.diagram}
                title={t("diagram.alt")}
                className="block h-auto w-full"
              />
            </div>
          </div>
        );
    }
  })();

  const planId = "planId" in proposal ? proposal.planId : null;
  const createdId = proposal.kind === "create_session" ? proposal.createdPlanId : null;

  return (
    <article
      aria-label={t(`kinds.${proposal.kind}`)}
      data-testid="proposal-card"
      data-kind={proposal.kind}
      data-status={proposal.status}
      className="animate-fade-up space-y-3 rounded-lg border border-line-strong bg-surface p-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-ink">
          <Sparkles className="size-3" aria-hidden />
          {t("badge")}
        </span>
        <h4 className="text-base font-semibold text-ink">{t(`kinds.${proposal.kind}`)}</h4>
      </header>

      {details}

      {/* Keyed on the status, so each real transition (pending → applying → applied/failed, or dismissed)
          crossfades in as its own block rather than the buttons silently swapping for text. */}
      <div key={proposal.status} className="animate-fade-in">
        {pending ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              disabled={busy}
              onClick={() => (destructive ? setConfirming(true) : onApply(false))}
            >
              {t(
                `buttons.${proposal.kind === "set_diagram" && proposal.replacing ? "updateDiagram" : BUTTON[proposal.kind]}`,
              )}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onDismiss}>
              {t("dismiss")}
            </Button>
            <p className="text-xs text-ink-muted">{t("nothingChanged")}</p>
          </div>
        ) : proposal.status === "applying" ? (
          <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("applying")}
          </p>
        ) : proposal.status === "applied" ? (
          <p
            className="flex flex-wrap items-center gap-3 text-sm text-ink"
            data-testid="proposal-applied"
          >
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Check className="size-4 animate-pop text-success" aria-hidden />
              {t("applied")}
            </span>
            {createdId ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={sessionHref(createdId)}>{t("openBuilder")}</Link>
              </Button>
            ) : planId ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={sessionHref(planId)}>{t("openSession")}</Link>
              </Button>
            ) : null}
          </p>
        ) : proposal.status === "dismissed" ? (
          <p className="text-sm text-ink-muted">{t("dismissed")}</p>
        ) : (
          <p
            role="alert"
            className="flex items-center gap-2 text-sm text-ink"
            data-testid="proposal-failed"
          >
            <CircleAlert className="size-4 text-danger" aria-hidden />
            {t.has(`failures.${proposal.error ?? "INTERNAL"}`)
              ? t(`failures.${proposal.error ?? "INTERNAL"}`)
              : t("failures.INTERNAL")}
          </p>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title={t("confirm.title")}
          description={t("confirm.body")}
          closeLabel={tc("close")}
        >
          <div className="space-y-4">
            {details}
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
                  setConfirming(false);
                  onApply(true);
                }}
              >
                {t("confirm.action")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
