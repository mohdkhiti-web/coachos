"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Copy,
  Loader2,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { DesignPanel } from "@/components/features/document/design-panel";
import { DocumentPreview } from "@/components/features/document/document-preview";
import { LeaveDialog, useLeaveGuard } from "@/components/features/document/leave-guard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_VISIBILITIES,
  type TemplateCategory,
  type TemplateVisibility,
} from "@/db/enums";
import { cn } from "@/lib/cn";
import type { Result } from "@/lib/result";
import {
  applyPreset,
  buildDocumentModel,
  checkDesign,
  emptyReflection,
  hasBlockingIssue,
  presetDesign,
  type DocumentDesign,
  type PresetId,
  type SessionDocumentInput,
} from "@/modules/documents";
import {
  createTemplateAction,
  deleteTemplateAction,
  duplicateTemplateAction,
  setTemplateStatusAction,
  updateTemplateAction,
} from "@/modules/templates/actions";
import { logoUrl, type LogoDto } from "@/modules/media/dto";
import type { TemplateDto } from "@/modules/templates/dto";

type Look = { preset: PresetId; design: DocumentDesign };
type Status = "saved" | "unsaved" | "saving" | "error" | "conflict" | "unreadable";

/**
 * Create or edit a saved template. It is the SAME design panel and the SAME live preview as a session's, pointed at a
 * sample session (invented, labelled as such) so the look can be judged on a realistic document. What is saved is the
 * design only: the panel has no place for a session's date, notes or reflection answers, and the server would refuse
 * them anyway. Editing never touches sessions that already used the template — they keep their own frozen copy.
 */
export function TemplateEditor({
  mode,
  sportKey,
  sportName,
  template,
  sample,
  personal,
  readOnly,
  initialView,
  logos,
  canUploadLogo,
}: {
  mode: "create" | "edit";
  sportKey: string;
  sportName: string;
  template: TemplateDto | null;
  sample: SessionDocumentInput;
  personal: boolean;
  readOnly: "archived" | "readOnly" | null;
  initialView: "design" | "preview";
  logos: LogoDto[];
  canUploadLogo: boolean;
}) {
  const t = useTranslations("templates.editor");
  const tt = useTranslations("templates");
  const tp = useTranslations("sessions.design");
  const tcat = useTranslations("templates.categories");
  const tvis = useTranslations("templates.visibility");
  const tv = useTranslations("validation");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = React.useState(template?.name ?? "");
  const [description, setDescription] = React.useState(template?.description ?? "");
  const [category, setCategory] = React.useState<TemplateCategory>(template?.category ?? "general");
  const [visibility, setVisibility] = React.useState<TemplateVisibility>(
    template?.visibility ?? "private",
  );
  const [look, setLook] = React.useState<Look>(
    template
      ? { preset: template.preset, design: template.design }
      : { preset: "classic", design: presetDesign("classic") },
  );
  const fields = { name, description, category, visibility: personal ? "private" : visibility };
  const keyOf = (l: Look) => JSON.stringify({ ...fields, ...l });
  const [savedKey, setSavedKey] = React.useState(() => keyOf(look));
  const [view, setView] = React.useState(initialView);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "error" | "conflict">(
    "idle",
  );
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const versionRef = React.useRef(template?.version ?? 1);

  const editable = readOnly === null;
  const dirty = keyOf(look) !== savedKey;
  const guard = useLeaveGuard(dirty && editable);
  const unreadable = hasBlockingIssue(checkDesign(look.design));
  const base = `/templates/${sportKey}`;

  const deferred = React.useDeferredValue(look);
  const model = React.useMemo(
    () => buildDocumentModel(sample, deferred.design, emptyReflection()),
    [sample, deferred.design],
  );

  const msg = (key: string) => (tv.has(key) ? tv(key) : te("VALIDATION"));
  const errorText = (code: string) => (te.has(code) ? te(code) : te("generic"));

  const save = React.useCallback(async (): Promise<boolean> => {
    if (!editable || unreadable) return false;
    if (!name.trim()) {
      setErrors({ name: [tv("required")] });
      return false;
    }
    setErrors({});
    setSaveState("saving");
    const payload = {
      name,
      description,
      category,
      visibility: personal ? "private" : visibility,
      preset: look.preset,
      design: look.design,
    };
    let result: Result<{ id: string; version: number }>;
    try {
      result =
        mode === "create"
          ? await createTemplateAction(sportKey, payload)
          : await updateTemplateAction(sportKey, template!.id, {
              ...payload,
              version: versionRef.current,
            });
    } catch {
      setSaveState("error");
      return false;
    }
    if (!result.ok) {
      if (result.error.code === "VALIDATION" && result.error.fields) {
        const next: Record<string, string[]> = {};
        for (const [path, keys] of Object.entries(result.error.fields))
          next[path.split(".")[0]!] = keys.map(msg);
        setErrors(next);
        setSaveState("idle");
      } else {
        setSaveState(result.error.code === "CONFLICT" ? "conflict" : "error");
        if (result.error.code !== "CONFLICT") toast(errorText(result.error.code), "error");
      }
      return false;
    }
    versionRef.current = result.data.version;
    setSavedKey(keyOf(look));
    setSaveState("idle");
    toast(tt("toast.saved"), "success");
    if (mode === "create") guard.go(`${base}/${result.data.id}`);
    else router.refresh(); // the revision and version shown come from the server
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editable,
    unreadable,
    name,
    description,
    category,
    visibility,
    look,
    mode,
    sportKey,
    template,
    personal,
  ]);

  const run = (
    call: () => Promise<Result<{ id: string; version: number }>>,
    done: string,
    after: (r: { id: string; version: number }) => void,
  ) =>
    startTransition(async () => {
      const r = await call();
      if (r.ok) {
        toast(done, "success");
        after(r.data);
      } else
        toast(r.error.code === "CONFLICT" ? tt("toast.changed") : errorText(r.error.code), "error");
    });

  const status: Status = unreadable
    ? "unreadable"
    : saveState === "saving"
      ? "saving"
      : saveState === "conflict"
        ? "conflict"
        : saveState === "error"
          ? "error"
          : dirty
            ? "unsaved"
            : "saved";
  const StatusIcon =
    status === "saved"
      ? CheckCircle2
      : status === "saving"
        ? Loader2
        : status === "unsaved"
          ? PencilLine
          : CircleAlert;

  const tabs = (["design", "preview"] as const).map((v) => (
    <li key={v}>
      <button
        type="button"
        aria-pressed={view === v}
        onClick={() => setView(v)}
        className={cn(
          "focus-visible:outline-focus flex min-h-10 items-center rounded-sm px-4 text-sm font-medium focus-visible:outline-2",
          view === v ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-sunken",
        )}
      >
        {t(`tabs.${v}`)}
      </button>
    </li>
  ));

  const details = (
    <section
      aria-labelledby="template-details-heading"
      className="space-y-4 border-b border-line px-1 py-4"
    >
      <h2 id="template-details-heading" className="text-base font-semibold text-ink">
        {t("details")}
      </h2>
      <Field label={t("name")} errors={errors.name}>
        {(c) => (
          <Input
            {...c}
            value={name}
            maxLength={80}
            autoComplete="off"
            disabled={!editable}
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
            disabled={!editable}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>
      <Field label={t("category")}>
        {(c) => (
          <Select
            {...c}
            value={category}
            disabled={!editable}
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
        <Field label={t("visibility")} hint={tt(`save.visibilityHint.${visibility}`)}>
          {(c) => (
            <Select
              {...c}
              value={visibility}
              disabled={!editable}
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
      {mode === "edit" ? <p className="text-xs text-ink-muted">{t("editNote")}</p> : null}
    </section>
  );

  return (
    <div data-page-wide className="doc-print-root space-y-5">
      <header className="doc-screen-only space-y-4">
        <Link
          href={base}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xs text-sm font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {tt("title")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="eyebrow text-accent">{sportName}</p>
            <h1 className="display text-3xl break-words text-ink md:text-4xl">
              {mode === "create" ? t("newTitle") : name.trim() || t("untitled")}
            </h1>
            {mode === "edit" && template ? (
              <p className="text-sm text-ink-muted">
                {t("meta", { revision: template.revision, version: template.version })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {editable ? (
              <>
                <div
                  role="status"
                  aria-live="polite"
                  data-state={status}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-2 text-sm",
                    status === "unreadable" || status === "error" || status === "conflict"
                      ? "font-medium text-danger"
                      : "text-ink-muted",
                  )}
                >
                  <StatusIcon
                    aria-hidden
                    className={cn(
                      "size-4",
                      status === "saving" && "animate-spin motion-reduce:animate-none",
                    )}
                  />
                  {t(`save.${status}`)}
                </div>
                <Button
                  type="button"
                  onClick={() => void save()}
                  disabled={(mode === "edit" && !dirty) || unreadable || saveState === "saving"}
                  loading={saveState === "saving"}
                >
                  {mode === "create" ? t("save.create") : t("save.button")}
                </Button>
              </>
            ) : null}
            {mode === "edit" && template ? (
              <Menu>
                <MenuTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={t("actions")}
                    disabled={pending}
                  >
                    <MoreHorizontal className="size-4" aria-hidden />
                    {t("actionsShort")}
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {template.permissions.canDuplicate ? (
                    <MenuItem
                      onSelect={() =>
                        run(
                          () => duplicateTemplateAction(sportKey, template.id),
                          tt("toast.duplicated"),
                          (r) => guard.go(`${base}/${r.id}`),
                        )
                      }
                    >
                      <Copy className="size-4" aria-hidden />
                      {tt("actions.duplicate")}
                    </MenuItem>
                  ) : null}
                  {template.permissions.canDelete ? <MenuSeparator /> : null}
                  {template.permissions.canDelete ? (
                    template.status === "archived" ? (
                      <MenuItem
                        onSelect={() =>
                          run(
                            () =>
                              setTemplateStatusAction(
                                sportKey,
                                template.id,
                                "active",
                                versionRef.current,
                              ),
                            tt("toast.restored"),
                            () => router.refresh(),
                          )
                        }
                      >
                        <RotateCcw className="size-4" aria-hidden />
                        {tt("actions.restore")}
                      </MenuItem>
                    ) : (
                      <MenuItem
                        onSelect={() =>
                          run(
                            () =>
                              setTemplateStatusAction(
                                sportKey,
                                template.id,
                                "archived",
                                versionRef.current,
                              ),
                            tt("toast.archived"),
                            () => router.refresh(),
                          )
                        }
                      >
                        <Archive className="size-4" aria-hidden />
                        {tt("actions.archive")}
                      </MenuItem>
                    )
                  ) : null}
                  {template.permissions.canDelete ? (
                    <MenuItem onSelect={() => setConfirmDelete(true)}>
                      <Trash2 className="size-4" aria-hidden />
                      {tt("actions.delete")}
                    </MenuItem>
                  ) : null}
                </MenuContent>
              </Menu>
            ) : null}
          </div>
        </div>
        {!editable && readOnly ? (
          <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
            {t(`readOnly.${readOnly}`)}
          </p>
        ) : null}
        {status === "conflict" ? (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-ink"
          >
            {t("conflictBanner")}{" "}
            <button
              type="button"
              className="font-medium underline underline-offset-4"
              onClick={() => window.location.reload()}
            >
              {tp("save.reload")}
            </button>
          </p>
        ) : null}
        <nav aria-label={t("views")}>
          <ul className="inline-flex rounded-md border border-line-strong bg-surface-raised p-1 lg:hidden">
            {tabs}
          </ul>
        </nav>
      </header>

      <div className="doc-workspace-grid grid items-start gap-6 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
        <div
          className={cn(
            "doc-screen-only lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto",
            view === "preview" && "hidden lg:block",
          )}
          data-testid="design-panel"
        >
          <DesignPanel
            design={look.design}
            preset={look.preset}
            reflection={emptyReflection()}
            onDesign={(design) => setLook((l) => ({ ...l, design }))}
            onPreset={(preset) =>
              setLook((l) => ({ preset, design: applyPreset(l.design, preset) }))
            }
            onReflection={() => {}}
            showAnswers={false}
            logos={logos}
            canUploadLogo={canUploadLogo && editable}
            header={details}
          />
        </div>
        <div
          className={cn(
            "doc-preview-column min-w-0 space-y-3",
            view === "design" && "hidden lg:block",
          )}
        >
          <p className="doc-screen-only rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
            {t("sampleNote", { sport: sportName })}
          </p>
          <DocumentPreview model={model} onPrint={() => window.print()} logoSrc={logoUrl} />
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={tt("actions.deleteTitle")}
          description={tt("actions.deleteBody", { name: template?.name ?? "" })}
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
                setConfirmDelete(false);
                if (template)
                  run(
                    () => deleteTemplateAction(sportKey, template.id),
                    tt("toast.deleted"),
                    () => guard.go(base),
                  );
              }}
            >
              {tt("actions.deleteConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LeaveDialog
        href={guard.leaveTo}
        canSave={editable}
        saveDisabled={unreadable}
        onClose={() => guard.setLeaveTo(null)}
        onLeave={guard.go}
        onSaveAndLeave={save}
      />
    </div>
  );
}
