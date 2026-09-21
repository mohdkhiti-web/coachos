"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { PlanTemplateDto } from "@/modules/plans/dto";
import { Tag } from "./template-bits";

/**
 * The saved-template controls of the design screen: which template this session is based on (and whether a newer
 * design of it exists), choosing another, saving this design as a template, and letting go of the link. Applying a
 * template changes the session's DESIGN only; the text below says so, so nobody has to wonder.
 */
export function TemplatePanel({
  sportKey,
  link,
  canSave,
  canCreate,
  hasTemplates,
  busy,
  onChoose,
  onUpdate,
  onDetach,
  onSaveAs,
}: {
  sportKey: string;
  link: PlanTemplateDto | null;
  canSave: boolean;
  canCreate: boolean;
  hasTemplates: boolean;
  busy: boolean;
  onChoose: () => void;
  onUpdate: () => void;
  onDetach: () => void;
  onSaveAs: () => void;
}) {
  const t = useTranslations("templates.panel");
  return (
    <section
      aria-labelledby="template-panel-heading"
      className="space-y-3 border-b border-line px-1 py-4"
      data-testid="template-panel"
    >
      <h2 id="template-panel-heading" className="text-base font-semibold text-ink">
        {t("heading")}
      </h2>

      {link ? (
        <div className="space-y-2">
          <p className="text-sm text-ink">
            {t("basedOn")} <strong className="font-semibold">{link.name}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{t("revision", { revision: link.revision })}</Tag>
            {link.status === "update_available" ? (
              <Tag tone="accent">
                {t("updateAvailable", { revision: link.latestRevision ?? 0 })}
              </Tag>
            ) : null}
            {link.status === "unavailable" ? <Tag tone="warning">{t("unavailable")}</Tag> : null}
          </div>
          {link.status === "unavailable" ? (
            <p className="text-sm text-ink-muted">{t("unavailableHint")}</p>
          ) : null}
          {link.status === "update_available" ? (
            <p className="text-sm text-ink-muted">{t("updateHint")}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t("none")}</p>
      )}

      {canSave ? (
        <div className="flex flex-wrap gap-2">
          {link?.status === "update_available" ? (
            <Button type="button" size="sm" onClick={onUpdate} disabled={busy}>
              {t("update")}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onChoose}
            disabled={busy || !hasTemplates}
          >
            {link ? t("change") : t("choose")}
          </Button>
          {link ? (
            <Button type="button" size="sm" variant="ghost" onClick={onDetach} disabled={busy}>
              {t("detach")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {canSave && !hasTemplates ? (
        <p className="text-sm text-ink-muted">{t("noTemplates")}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {canCreate ? (
          <Button type="button" size="sm" variant="secondary" onClick={onSaveAs} disabled={busy}>
            {t("saveAs")}
          </Button>
        ) : null}
        <Link
          href={`/templates/${sportKey}`}
          className="inline-flex min-h-9 items-center text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {t("manage")}
        </Link>
      </div>
      <p className="text-xs text-ink-muted">{t("scope")}</p>
    </section>
  );
}
