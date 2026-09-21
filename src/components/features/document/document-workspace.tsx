"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2, PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { Result } from "@/lib/result";
import {
  applyPreset,
  buildDocumentModel,
  checkDesign,
  hasBlockingIssue,
  MODES,
  PRESET_IDS,
  type DocumentDesign,
  type PresetId,
  type Reflection,
  type SessionDocumentInput,
} from "@/modules/documents";
import { savePlanDocumentAction } from "@/modules/plans/actions";
import { Segmented } from "./controls";
import { DesignPanel } from "./design-panel";
import { DocumentPreview } from "./document-preview";
import { WorkspaceTabs, type WorkspaceView } from "./workspace-tabs";

type Look = { preset: PresetId; design: DocumentDesign; reflection: Reflection };
type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict" | "unreadable";

const keyOf = (l: Look) => JSON.stringify(l);

/**
 * Design and preview of one session. The design lives here as ONE value; the document model is rebuilt from it
 * (deferred, so typing or dragging a colour stays instant on a long session) and drawn by the shared page
 * components. Nothing else can change what the pages show. Unsaved changes are never lost by accident: leaving
 * (tab, link, reload) asks first.
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
}) {
  const t = useTranslations("sessions.design");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();

  const [look, setLook] = React.useState<Look>(initial);
  const [savedKey, setSavedKey] = React.useState(() => keyOf(initial));
  const [view, setViewState] = React.useState(initialView);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "error" | "conflict">(
    "idle",
  );
  const versionRef = React.useRef(version);
  const leaveAllowed = React.useRef(false);
  const [leaveTo, setLeaveTo] = React.useState<string | null>(null);

  const dirty = keyOf(look) !== savedKey;
  const issues = React.useMemo(() => checkDesign(look.design), [look.design]);
  const unreadable = hasBlockingIssue(issues);

  // The document: rebuilt only when the design or the reflection change, and deferred so the controls stay snappy.
  const deferred = React.useDeferredValue(look);
  const model = React.useMemo(
    () => buildDocumentModel(input, deferred.design, deferred.reflection),
    [input, deferred.design, deferred.reflection],
  );

  const setView = (next: Exclude<WorkspaceView, "builder">) => {
    setViewState(next);
    window.history.replaceState(null, "", `?view=${next}`);
  };

  const setDesign = (design: DocumentDesign) => setLook((l) => ({ ...l, design }));
  const setPreset = (preset: PresetId) =>
    setLook((l) => ({ ...l, preset, design: applyPreset(l.design, preset) }));
  const setReflection = (reflection: Reflection) => setLook((l) => ({ ...l, reflection }));

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
      versionRef.current = result.data.version;
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
  }, [canSave, unreadable, look, sportKey, planId, toast, t, te]);

  // ---- never lose changes by accident -----------------------------------------------------------
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!leaveAllowed.current) e.preventDefault();
    };
    // in-app links (the side navigation, the account menu…): ask first
    const onClick = (e: MouseEvent) => {
      if (leaveAllowed.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return; // the view tabs of this very page
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const goTo = (href: string) => {
    leaveAllowed.current = true;
    router.push(href);
  };
  const selectView = (next: WorkspaceView) => {
    if (next === "builder") {
      const href = `/sessions/${sportKey}/${planId}`;
      if (dirty) setLeaveTo(href);
      else goTo(href);
    } else setView(next);
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

      <Dialog open={leaveTo !== null} onOpenChange={(open) => !open && setLeaveTo(null)}>
        <DialogContent
          title={t("leave.title")}
          description={t("leave.body")}
          closeLabel={tc("close")}
        >
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t("leave.stay")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const href = leaveTo;
                setLeaveTo(null);
                if (href) goTo(href);
              }}
            >
              {t("leave.discard")}
            </Button>
            {canSave ? (
              <Button
                type="button"
                disabled={unreadable}
                onClick={async () => {
                  const href = leaveTo;
                  if (href && (await save())) {
                    setLeaveTo(null);
                    goTo(href);
                  }
                }}
              >
                {t("leave.saveAndLeave")}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
