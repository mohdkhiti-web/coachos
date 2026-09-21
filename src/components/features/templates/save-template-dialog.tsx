"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_VISIBILITIES,
  type TemplateCategory,
  type TemplateVisibility,
} from "@/db/enums";
import type { Result } from "@/lib/result";
import type { DocumentDesign, PresetId } from "@/modules/documents";
import { applyTemplateToPlanAction } from "@/modules/plans/actions";
import type { AppliedDesignDto } from "@/modules/plans/dto";
import { createTemplateAction } from "@/modules/templates/actions";

/**
 * Save the design on screen as a template: a name, a description, a category and who can use it. Only the DESIGN is
 * saved — never anything that belongs to this session — and the coach can have the session point at the new template
 * straight away.
 */
export function SaveTemplateDialog({
  open,
  onClose,
  sportKey,
  personal,
  preset,
  design,
  session,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  sportKey: string;
  /** A personal workspace has nobody to share with, so there is no visibility choice. */
  personal: boolean;
  preset: PresetId;
  design: DocumentDesign;
  /** The session being designed, when there is one that may be linked to the new template. */
  session?: { id: string; version: number } | null;
  onSaved: (saved: { templateId: string; applied: AppliedDesignDto | null }) => void;
}) {
  const t = useTranslations("templates.save");
  const tc = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t("title")} description={t("body")} closeLabel={tc("close")}>
        <SaveForm
          sportKey={sportKey}
          personal={personal}
          preset={preset}
          design={design}
          session={session ?? null}
          onClose={onClose}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

function SaveForm({
  sportKey,
  personal,
  preset,
  design,
  session,
  onClose,
  onSaved,
}: {
  sportKey: string;
  personal: boolean;
  preset: PresetId;
  design: DocumentDesign;
  session: { id: string; version: number } | null;
  onClose: () => void;
  onSaved: (saved: { templateId: string; applied: AppliedDesignDto | null }) => void;
}) {
  const t = useTranslations("templates.save");
  const tcat = useTranslations("templates.categories");
  const tvis = useTranslations("templates.visibility");
  const tv = useTranslations("validation");
  const te = useTranslations("errors");

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState<TemplateCategory>("general");
  const [visibility, setVisibility] = React.useState<TemplateVisibility>("private");
  const [link, setLink] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [failure, setFailure] = React.useState<string | null>(null);

  const msg = (key: string) => (tv.has(key) ? tv(key) : te("VALIDATION"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrors({ name: [tv("required")] });
      return;
    }
    setBusy(true);
    setErrors({});
    setFailure(null);
    let created: Result<{ id: string; version: number }>;
    try {
      created = await createTemplateAction(sportKey, {
        name,
        description,
        category,
        visibility: personal ? "private" : visibility,
        preset,
        design,
      });
    } catch {
      setBusy(false);
      setFailure(te("network"));
      return;
    }
    if (!created.ok) {
      setBusy(false);
      if (created.error.code === "VALIDATION" && created.error.fields) {
        const next: Record<string, string[]> = {};
        for (const [path, keys] of Object.entries(created.error.fields))
          next[path.split(".")[0]!] = keys.map(msg);
        setErrors(next);
        if (next.design) setFailure(t("unreadable"));
      } else setFailure(te.has(created.error.code) ? te(created.error.code) : te("generic"));
      return;
    }
    let applied: AppliedDesignDto | null = null;
    if (session && link) {
      const linked = await applyTemplateToPlanAction(sportKey, session.id, {
        version: session.version,
        templateId: created.data.id,
        mode: "replace",
        confirmed: true,
      });
      if (linked.ok) applied = linked.data;
    }
    setBusy(false);
    onSaved({ templateId: created.data.id, applied });
    onClose();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label={t("name")} errors={errors.name}>
        {(c) => (
          <Input
            {...c}
            value={name}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field label={t("description")} errors={errors.description} hint={t("descriptionHint")}>
        {(c) => (
          <Textarea
            {...c}
            className="min-h-20"
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>
      <Field label={t("category")}>
        {(c) => (
          <Select
            {...c}
            value={category}
            onChange={(e) => setCategory(e.target.value as TemplateCategory)}
          >
            {TEMPLATE_CATEGORIES.map((k) => (
              <option key={k} value={k}>
                {tcat(k)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {personal ? null : (
        <Field label={t("visibility")} hint={t(`visibilityHint.${visibility}`)}>
          {(c) => (
            <Select
              {...c}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as TemplateVisibility)}
            >
              {TEMPLATE_VISIBILITIES.map((k) => (
                <option key={k} value={k}>
                  {tvis(k)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {session ? (
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
          <Checkbox checked={link} onChange={(e) => setLink(e.target.checked)} className="mt-0.5" />
          <span>
            {t("useForSession")}
            <span className="block text-ink-muted">{t("useForSessionHint")}</span>
          </span>
        </label>
      ) : null}
      <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">{t("scope")}</p>
      {failure ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {failure}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {t("cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" loading={busy}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
