"use client";

import * as React from "react";
import { CheckCircle2, CircleAlert, Loader2, PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApplyTemplateDialog } from "@/components/features/templates/apply-template-dialog";
import { SaveTemplateDialog } from "@/components/features/templates/save-template-dialog";
import { TemplatePanel } from "@/components/features/templates/template-panel";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { Result } from "@/lib/result";
import {
  applyLook,
  applyPreset,
  buildDocumentModel,
  checkDesign,
  hasBlockingIssue,
  MODES,
  PRESET_IDS,
  resolveDesign,
  resolveSessionDesign,
  type DesignOverride,
  type DocumentDesign,
  type PresetId,
  type Reflection,
  type SessionDocumentInput,
} from "@/modules/documents";
import { detachTemplateAction, savePlanDocumentAction } from "@/modules/plans/actions";
import type { AppliedDesignDto, PlanTemplateDto } from "@/modules/plans/dto";
import type { TemplateChoice } from "@/modules/templates/dto";
import { Segmented } from "./controls";
import { DesignPanel } from "./design-panel";
import { DocumentPreview } from "./document-preview";
import { LeaveDialog, useLeaveGuard } from "./leave-guard";
import { WorkspaceTabs, type WorkspaceView } from "./workspace-tabs";

type Look = { preset: PresetId; design: DocumentDesign; reflection: Reflection };
type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict" | "unreadable";

const keyOf = (l: Look) => JSON.stringify(l);

/**
 * Design and preview of one session. The design lives here as ONE value; the document model is rebuilt from it
 * (deferred, so typing or dragging a colour stays instant on a long session) and drawn by the shared page
 * components. Nothing else can change what the pages show. Unsaved changes are never lost by accident: leaving
 * (tab, link, reload) asks first.
 *
 * Saved templates: the session may be based on one (Preset → Template → the session's own changes). Choosing,
 * updating or detaching a template goes through the server, which returns the session's new stored design; this
 * screen then shows exactly that.
 */
export function DocumentWorkspace({
  sportKey,
  planId,
  title,
  version,
  input,
  initial,
  canSave,
  readOnlyReason,
  initialView,
  templateLink,
  templateLayer,
  templates,
  canCreateTemplate,
  personalWorkspace,
}: {
  sportKey: string;
  planId: string;
  title: string;
  version: number;
  input: SessionDocumentInput;
  initial: Look;
  canSave: boolean;
  readOnlyReason: "archived" | "readOnly" | null;
  initialView: Exclude<WorkspaceView, "builder">;
  templateLink: PlanTemplateDto | null;
  /** The frozen layer of that template (for what "still as designed" means). */
  templateLayer: DesignOverride | null;
  templates: TemplateChoice[];
  canCreateTemplate: boolean;
  personalWorkspace: boolean;
}) {
  const t = useTranslations("sessions.design");
  const tt = useTranslations("templates");
  const te = useTranslations("errors");
  const { toast } = useToast();

  const [look, setLook] = React.useState<Look>(initial);
  const [savedKey, setSavedKey] = React.useState(() => keyOf(initial));
  const [view, setViewState] = React.useState(initialView);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "error" | "conflict">(
    "idle",
  );
  const [link, setLink] = React.useState(templateLink);
  const [layer, setLayer] = React.useState(templateLayer);
  const [dialog, setDialog] = React.useState<"apply" | "save" | null>(null);
  const [applyTemplateId, setApplyTemplateId] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);
  // the version lives in a ref for the async handlers (always the latest) and in state for what the dialogs render
  const versionRef = React.useRef(version);
  const [sessionVersion, setSessionVersion] = React.useState(version);
  const setVersion = React.useCallback((next: number) => {
    versionRef.current = next;
    setSessionVersion(next);
  }, []);

  const dirty = keyOf(look) !== savedKey;
  const guard = useLeaveGuard(dirty);
  const issues = React.useMemo(() => checkDesign(look.design), [look.design]);
  const unreadable = hasBlockingIssue(issues);

  // The document: rebuilt only when the design or the reflection change, and deferred so the controls stay snappy.
  const deferred = React.useDeferredValue(look);
  const model = React.useMemo(
    () => buildDocumentModel(input, deferred.design, deferred.reflection),
    [input, deferred.design, deferred.reflection],
  );

  // "As designed" = the preset, then the template's layer: what Reset look returns to
  const baseLook = React.useMemo(
    () => resolveDesign({ preset: look.preset, template: layer }),
    [look.preset, layer],
  );

  const setView = (next: Exclude<WorkspaceView, "builder">) => {
    setViewState(next);
    window.history.replaceState(null, "", `?view=${next}`);
  };

  const setDesign = (design: DocumentDesign) => setLook((l) => ({ ...l, design }));
  const setPreset = (preset: PresetId) =>
    setLook((l) => ({ ...l, preset, design: applyPreset(l.design, preset) }));
  const setReflection = (reflection: Reflection) => setLook((l) => ({ ...l, reflection }));

  /** Show what the server now holds for this session (after a template was applied or detached). */
  const adopt = (applied: AppliedDesignDto, opts: { keepReflection?: boolean } = {}) => {
    const stored: Look = {
      preset: applied.settings.preset,
      design: resolveSessionDesign(applied.settings),
      reflection: applied.settings.reflection,
    };
    // reflection text typed but not yet saved is the coach's own words: saving a template must not eat it
    setLook(opts.keepReflection ? { ...stored, reflection: look.reflection } : stored);
    setSavedKey(keyOf(stored));
    setSaveState("idle");
    setVersion(applied.version);
    setLink(applied.template);
    setLayer(applied.settings.template?.design ?? null);
  };

  const save = React.useCallback(async (): Promise<boolean> => {
    if (!canSave || unreadable) return false;
    const snapshot = look;
    setSaveState("saving");
    let result: Result<{ version: number }>;
    try {
      result = await savePlanDocumentAction(sportKey, planId, {
        version: versionRef.current,
        preset: snapshot.preset,
        design: snapshot.design,
        reflection: snapshot.reflection,
      });
    } catch {
      setSaveState("error");
      return false;
    }
    if (result.ok) {
      setVersion(result.data.version);
      setSavedKey(keyOf(snapshot));
      setSaveState("idle");
      toast(t("save.savedToast"), "success");
      return true;
    }
    setSaveState(result.error.code === "CONFLICT" ? "conflict" : "error");
    if (result.error.code !== "CONFLICT") {
      toast(te.has(result.error.code) ? te(result.error.code) : te("generic"), "error");
    }
    return false;
  }, [canSave, unreadable, look, sportKey, planId, toast, t, te, setVersion]);

  const selectView = (next: WorkspaceView) => {
    if (next === "builder") guard.request(`/sessions/${sportKey}/${planId}`);
    else setView(next);
  };

  const print = async () => {
    // fonts must be in before the browser lays the sheets out, or a late font would reflow them
    try {
      await document.fonts?.ready;
    } catch {
      /* printing without waiting is still better than not printing */
    }
    window.print();
  };

  const detach = async () => {
    setBusy(true);
    try {
      const result = await detachTemplateAction(sportKey, planId, versionRef.current);
      if (result.ok) {
        adopt(result.data);
        toast(tt("toast.detached"), "success");
      } else toast(te.has(result.error.code) ? te(result.error.code) : te("generic"), "error");
    } finally {
      setBusy(false);
    }
  };

  const openApply = (templateId?: string) => {
    setApplyTemplateId(templateId);
    setDialog("apply");
  };

  const ownDesign =
    link !== null ||
    dirty ||
    look.preset !== "classic" ||
    JSON.stringify(look.design) !== JSON.stringify(baseLook);

  const status: SaveState = unreadable
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

  return (
    <div data-page-wide className="doc-print-root space-y-5">
      <header className="doc-screen-only space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="display text-3xl break-words text-ink md:text-4xl">{t("heading")}</h1>
            <p className="text-sm break-words text-ink-muted">{title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
            {canSave ? (
              <Button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || unreadable || saveState === "saving"}
                loading={saveState === "saving"}
              >
                {t("save.button")}
              </Button>
            ) : null}
          </div>
        </div>
        {!canSave && readOnlyReason ? (
          <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
            {t(`readOnly.${readOnlyReason}`)}
          </p>
        ) : null}
        {status === "conflict" ? (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-ink"
          >
            {t("save.conflictBanner")}{" "}
            <button
              type="button"
              className="font-medium underline underline-offset-4"
              onClick={() => window.location.reload()}
            >
              {t("save.reload")}
            </button>
          </p>
        ) : null}
        <WorkspaceTabs current={view} sportKey={sportKey} planId={planId} onSelect={selectView} />
      </header>

      <div
        className={cn(
          "doc-workspace-grid grid items-start gap-6",
          view === "design" ? "lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]" : "grid-cols-1",
        )}
      >
        <div
          className={cn(
            "doc-screen-only lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto",
            view === "preview" && "hidden",
          )}
          data-testid="design-panel"
        >
          <DesignPanel
            design={look.design}
            preset={look.preset}
            reflection={look.reflection}
            onDesign={setDesign}
            onPreset={setPreset}
            onReflection={setReflection}
            baseLook={baseLook}
            onResetLook={() => setDesign(applyLook(look.design, baseLook))}
            header={
              <TemplatePanel
                sportKey={sportKey}
                link={link}
                canSave={canSave}
                canCreate={canCreateTemplate}
                hasTemplates={templates.length > 0}
                busy={busy}
                onChoose={() => openApply()}
                onUpdate={() => openApply(link?.id)}
                onDetach={() => void detach()}
                onSaveAs={() => setDialog("save")}
              />
            }
          />
        </div>

        <div
          className={cn(
            "doc-preview-column min-w-0 space-y-3",
            view === "design" && "hidden lg:block",
          )}
        >
          {view === "preview" ? (
            <div className="doc-screen-only flex flex-wrap items-end gap-3 lg:hidden">
              <label className="min-w-40 flex-1 text-sm font-medium text-ink">
                {t("quick.preset")}
                <Select
                  className="mt-1"
                  value={look.preset}
                  onChange={(e) => setPreset(e.target.value as PresetId)}
                >
                  {PRESET_IDS.map((id) => (
                    <option key={id} value={id}>
                      {t(`presets.${id}.name`)}
                    </option>
                  ))}
                </Select>
              </label>
              <Segmented
                legend={t("mode.legend")}
                value={look.design.mode}
                options={MODES.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
                onChange={(mode) => setDesign({ ...look.design, mode })}
              />
            </div>
          ) : null}
          <DocumentPreview model={model} onPrint={() => void print()} />
        </div>
      </div>

      <ApplyTemplateDialog
        open={dialog === "apply"}
        onClose={() => setDialog(null)}
        sportKey={sportKey}
        templates={templates}
        sessions={[{ id: planId, title, version: sessionVersion, hasOwnDesign: ownDesign }]}
        initialTemplateId={applyTemplateId ?? templates.find((x) => x.id !== link?.id)?.id}
        initialSessionId={planId}
        lockSession
        discardNote={dirty}
        onApplied={(applied) => {
          adopt(applied);
          toast(tt("toast.applied", { name: applied.template?.name ?? "" }), "success");
        }}
      />
      <SaveTemplateDialog
        open={dialog === "save"}
        onClose={() => setDialog(null)}
        sportKey={sportKey}
        personal={personalWorkspace}
        preset={look.preset}
        design={look.design}
        session={canSave ? { id: planId, version: sessionVersion } : null}
        onSaved={({ applied }) => {
          toast(tt("toast.saved"), "success");
          if (applied) adopt(applied, { keepReflection: true });
        }}
      />

      <LeaveDialog
        href={guard.leaveTo}
        canSave={canSave}
        saveDisabled={unreadable}
        onClose={() => guard.setLeaveTo(null)}
        onLeave={guard.go}
        onSaveAndLeave={save}
      />
    </div>
  );
}
