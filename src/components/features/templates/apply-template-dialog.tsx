"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { Result } from "@/lib/result";
import { applyTemplateToPlanAction } from "@/modules/plans/actions";
import type { AppliedDesignDto } from "@/modules/plans/dto";
import type { TemplateChoice } from "@/modules/templates/dto";
import { Swatches, Tag } from "./template-bits";

export interface ApplyTarget {
  id: string;
  title: string;
  version: number;
  /** Known when the caller can tell (the design screen); otherwise the server says so and the dialog asks. */
  hasOwnDesign?: boolean;
}

/**
 * Apply a saved template to a session. What it does and does not do is written in the dialog: it changes the
 * session's DESIGN and nothing else. When the session already has a design of its own the coach chooses — replace
 * it, or keep their own changes on top of the template (a session override always wins) — and the server insists on
 * that confirmation too, so it cannot be skipped by anything but a deliberate "yes".
 */
export function ApplyTemplateDialog({
  open,
  onClose,
  sportKey,
  templates,
  sessions,
  initialTemplateId,
  initialSessionId,
  lockTemplate = false,
  lockSession = false,
  discardNote = false,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  sportKey: string;
  templates: TemplateChoice[];
  sessions: ApplyTarget[];
  initialTemplateId?: string;
  initialSessionId?: string;
  lockTemplate?: boolean;
  lockSession?: boolean;
  /** Unsaved design changes on the screen behind the dialog are thrown away by applying. */
  discardNote?: boolean;
  onApplied: (applied: AppliedDesignDto) => void;
}) {
  const t = useTranslations("templates.apply");
  const tc = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t("title")}
        description={t("body")}
        closeLabel={tc("close")}
        className="max-w-xl"
      >
        <ApplyForm
          sportKey={sportKey}
          templates={templates}
          sessions={sessions}
          initialTemplateId={initialTemplateId}
          initialSessionId={initialSessionId}
          lockTemplate={lockTemplate}
          lockSession={lockSession}
          discardNote={discardNote}
          onClose={onClose}
          onApplied={onApplied}
        />
      </DialogContent>
    </Dialog>
  );
}

function ApplyForm({
  sportKey,
  templates,
  sessions,
  initialTemplateId,
  initialSessionId,
  lockTemplate,
  lockSession,
  discardNote,
  onClose,
  onApplied,
}: {
  sportKey: string;
  templates: TemplateChoice[];
  sessions: ApplyTarget[];
  initialTemplateId?: string;
  initialSessionId?: string;
  lockTemplate: boolean;
  lockSession: boolean;
  discardNote: boolean;
  onClose: () => void;
  onApplied: (applied: AppliedDesignDto) => void;
}) {
  const t = useTranslations("templates.apply");
  const tcat = useTranslations("templates.categories");
  const tvis = useTranslations("templates.visibility");
  const te = useTranslations("errors");
  const groupId = React.useId();

  const [templateId, setTemplateId] = React.useState(initialTemplateId ?? templates[0]?.id ?? "");
  const [sessionId, setSessionId] = React.useState(initialSessionId ?? sessions[0]?.id ?? "");
  const [mode, setMode] = React.useState<"replace" | "keep">("replace");
  const [asked, setAsked] = React.useState(false); // the server said the session already has a design
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const template = templates.find((x) => x.id === templateId);
  const session = sessions.find((x) => x.id === sessionId);
  const confirming = session?.hasOwnDesign === true || asked;

  const submit = async () => {
    if (!template || !session) return;
    setBusy(true);
    setMessage(null);
    let result: Result<AppliedDesignDto>;
    try {
      result = await applyTemplateToPlanAction(sportKey, session.id, {
        version: session.version,
        templateId: template.id,
        mode,
        confirmed: confirming,
      });
    } catch {
      setBusy(false);
      setMessage(te("network"));
      return;
    }
    setBusy(false);
    if (result.ok) {
      onApplied(result.data);
      onClose();
      return;
    }
    const { code } = result.error;
    if (code === "VALIDATION" && result.error.fields?.confirmed) setAsked(true);
    else if (code === "VALIDATION" && result.error.fields?.templateId) setMessage(t("archived"));
    else if (code === "CONFLICT") setMessage(t("conflict"));
    else if (code === "NOT_FOUND") setMessage(t("gone"));
    else setMessage(te.has(code) ? te(code) : te("generic"));
  };

  return (
    <div className="space-y-5">
      {lockSession && session ? (
        <p className="text-sm text-ink-muted">
          {t("forSession")} <strong className="font-semibold text-ink">{session.title}</strong>
        </p>
      ) : sessions.length > 0 ? (
        <label className="block text-sm font-medium text-ink">
          {t("session")}
          <Select
            className="mt-1"
            value={sessionId}
            onChange={(e) => {
              setSessionId(e.target.value);
              setAsked(false);
            }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
          {t("noSessions")}
        </p>
      )}

      {lockTemplate && template ? (
        <p className="text-sm text-ink-muted">
          {t("theTemplate")} <strong className="font-semibold text-ink">{template.name}</strong>
        </p>
      ) : (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">{t("template")}</legend>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {templates.map((c) => (
              <label
                key={c.id}
                className={cn(
                  "has-[:focus-visible]:outline-focus flex cursor-pointer flex-col gap-2 rounded-md border p-3 text-sm has-[:focus-visible]:outline-2",
                  c.id === templateId
                    ? "border-accent bg-accent-soft"
                    : "border-line-strong bg-surface hover:bg-surface-sunken",
                )}
              >
                <input
                  type="radio"
                  name={groupId}
                  value={c.id}
                  checked={c.id === templateId}
                  onChange={() => setTemplateId(c.id)}
                  className="sr-only"
                />
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{c.name}</span>
                  <Tag>{tcat(c.category)}</Tag>
                  <Tag>{tvis(c.visibility)}</Tag>
                </span>
                {c.description ? <span className="text-ink-muted">{c.description}</span> : null}
                <Swatches design={c.design} className="w-40" />
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">{t("scope")}</p>

      {confirming ? (
        <div
          className="space-y-3 rounded-md border border-warning bg-warning-soft p-3"
          role="group"
          aria-label={t("confirmTitle")}
        >
          <p className="text-sm font-medium text-ink">{t("confirmBody")}</p>
          <fieldset className="space-y-2">
            <legend className="sr-only">{t("confirmTitle")}</legend>
            {(["replace", "keep"] as const).map((m) => (
              <label key={m} className="flex cursor-pointer items-start gap-3 text-sm text-ink">
                <input
                  type="radio"
                  name={`${groupId}-mode`}
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="mt-1 size-4 accent-accent"
                />
                <span>
                  <span className="font-medium">{t(`mode.${m}`)}</span>
                  <span className="block text-ink-muted">{t(`mode.${m}Hint`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {discardNote ? <p className="text-sm text-ink">{t("discard")}</p> : null}
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {t("cancel")}
          </Button>
        </DialogClose>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={!template || !session}
          loading={busy}
        >
          {confirming ? t("confirm") : t("apply")}
        </Button>
      </div>
    </div>
  );
}
