"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  Download,
  FileImage,
  FileText,
  Hand,
  Layers,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  MousePointer2,
  Pause,
  Play,
  Printer,
  Redo2,
  RotateCcw,
  Scan,
  SlidersHorizontal,
  Undo2,
  Volume2,
  VolumeX,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
  Magnet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useSound } from "@/components/sound";
import {
  applyOps,
  buildTimeline,
  countInventory,
  DEFAULT_GRID,
  DiagramView,
  diagramSchema,
  isCarrier,
  snapPoint,
  stepCountOf,
  validateDiagram,
  type CourtPack,
  type Diagram,
  type DiagramInput,
  type DiagramOp,
  type Pt,
  type SnapGuide,
} from "@/engines/diagram";
import { getCourtPack } from "@/sports/registry";
import { cn } from "@/lib/cn";
import { CourtOverlay, handlePoints, type Preview } from "./court-overlay";
import { useLocalList } from "./use-local-list";
import { downloadBlob, drillSheetPdf, fileName, courtPng, courtSvg } from "./export";
import { PropertiesPanel } from "./properties-panel";
import { StepBar } from "./step-bar";
import { ToolGlyph } from "./tool-glyph";
import { ToolLibrary } from "./tool-library";
import { defaultSpot, placeOps, TOOL_BY_ID, type DrawSpec, type ToolDef } from "./tools";
import { canRedo, canUndo, useHistory } from "./use-history";
import {
  buildFragment,
  buildScene,
  courtBox,
  deleteOps,
  dragOps,
  fitToContent,
  fragmentSize,
  hitTest,
  isNothing,
  marqueeSelect,
  NO_SELECTION,
  panBy,
  pruneSelection,
  rotateOps,
  selectHit,
  selectionSize,
  viewBoxString,
  visibleBox,
  wholeCourt,
  zoomAt,
  type Fragment,
  type Selection,
  type View,
} from "./workspace-model";

/**
 * The drill diagram workspace: a professional basketball clipboard. A tool library on the left, the court in the middle, what
 * is selected on the right. Drag equipment and players onto the court, draw movement, passes and shots, step through the drill,
 * press Play. Everything is structured data edited through the shared diagram operations, so an edit can never leave an
 * invalid drawing, one Undo takes back exactly one thing, and the same data can be read by the AI Coach.
 */

export interface WorkspaceTemplate {
  key: string;
  diagram: DiagramInput;
}

export interface DiagramWorkspaceProps {
  diagram: DiagramInput;
  onChange: (diagram: Diagram) => void;
  /** The drill's title: the name of exported files and the heading of the printed sheet. */
  title?: string;
  /** Starting points (a shooting drill, a 3v2…): shown when the court is empty. */
  templates?: readonly WorkspaceTemplate[];
  disabled?: boolean;
  /** Extra controls at the end of the toolbar (e.g. "Remove this diagram"). */
  toolbarExtra?: React.ReactNode;
}

/** Entry point: the workspace can only edit a valid diagram, so anything else is explained instead of half-shown. */
export function DiagramWorkspace(props: DiagramWorkspaceProps) {
  const t = useTranslations("diagramWorkspace");
  const initial = React.useMemo(() => {
    const parsed = diagramSchema.safeParse(props.diagram);
    if (!parsed.success) return null;
    const pack = getCourtPack(parsed.data.sport, parsed.data.court);
    if (!pack || validateDiagram(parsed.data, pack).length > 0) return null;
    return parsed.data;
    // the diagram is the starting point: the workspace owns it from here on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!initial) {
    return (
      <p
        role="alert"
        className="rounded-md border border-danger bg-danger-soft p-4 text-sm text-ink"
      >
        {t("cannotEdit")}
      </p>
    );
  }
  return <Workspace {...props} initial={initial} />;
}

// ---------------------------------------------------------------------------------------------

type Gesture =
  | { kind: "none" }
  | {
      kind: "drag";
      ids: string[];
      notes: number[];
      start: Pt;
      origin: Pt;
      moved: boolean;
      delta: Pt;
    }
  | { kind: "marquee"; start: Pt; current: Pt; additive: boolean; moved: boolean }
  | { kind: "pan"; startX: number; startY: number; view: View }
  | { kind: "pinch"; distance: number; view: View; mid: Pt }
  | { kind: "rotate"; id: string; center: Pt; result: number | null }
  | { kind: "resize"; id: string; center: Pt; base: number; result: number | null }
  | { kind: "handle"; action: string; index: number; result: Pt | null }
  | { kind: "curve"; action: string; result: number | null }
  | {
      kind: "path";
      actor: string;
      spec: Extract<DrawSpec, { mode: "path" }>;
      start: Pt;
      current: Pt;
      moved: boolean;
    }
  | { kind: "link"; actor: string; spec: DrawSpec; start: Pt; current: Pt; moved: boolean }
  | { kind: "shape"; spec: DrawSpec; start: Pt; current: Pt; points: Pt[]; moved: boolean };

type Pending =
  | { kind: "path"; actor: string; spec: Extract<DrawSpec, { mode: "path" }>; points: Pt[] }
  | { kind: "link"; actor: string; spec: DrawSpec }
  | null;

const IDLE_UI = {
  dragDelta: null as Pt | null,
  preview: { kind: "none" } as Preview,
  guides: [] as SnapGuide[],
  drop: null as { at: Pt; valid: boolean } | null,
  dragIds: [] as string[],
  transient: null as Diagram | null,
};
type Ui = typeof IDLE_UI;

const SPEEDS = [0.5, 1, 2] as const;
const RECENT_KEY = "coachos.diagram.recent";
const FAVORITES_KEY = "coachos.diagram.favorites";

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Douglas–Peucker-free thinning: keep the ends and roughly evenly spaced points, at most `max`. */
function thin(points: readonly Pt[], max: number): Pt[] {
  if (points.length <= max) return points.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
  const out: Pt[] = [];
  for (let i = 0; i < max; i++) {
    const p = points[Math.round((i * (points.length - 1)) / (max - 1))]!;
    out.push({ x: round2(p.x), y: round2(p.y) });
  }
  return out;
}

function Workspace({
  initial,
  onChange,
  title,
  templates,
  disabled = false,
  toolbarExtra,
}: DiagramWorkspaceProps & { initial: Diagram }) {
  const t = useTranslations("diagramWorkspace");
  const tv = useTranslations("diagram.issues");
  const sound = useSound();

  const { state, dispatch } = useHistory(initial);
  const d = state.present;
  const pack = getCourtPack(d.sport, d.court) as CourtPack;
  const packFor = React.useCallback(
    (court: Diagram["court"]) => getCourtPack(d.sport, court),
    [d.sport],
  );
  const box = React.useMemo(() => courtBox(pack), [pack]);
  const courtId = `${d.court.type}:${d.court.variant}`;

  const [tool, setTool] = React.useState<ToolDef | null>(null);
  const [selectionState, setSelection] = React.useState<Selection>(NO_SELECTION);
  const [stepState, setStep] = React.useState(1);
  const [viewState, setViewState] = React.useState<{ court: string; view: View }>(() => ({
    court: courtId,
    view: wholeCourt(box),
  }));
  const [snapOn, setSnapOn] = React.useState(true);
  const [ui, setUi] = React.useState<Ui>(IDLE_UI);
  const [pending, setPending] = React.useState<Pending>(null);
  const [textDraft, setTextDraft] = React.useState<{ at: Pt; value: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [fullscreen, setFullscreen] = React.useState(false);
  const [panel, setPanel] = React.useState<"tools" | "props" | null>(null);
  const [numberDraft, setNumberDraft] = React.useState("");
  const [recent, setRecent] = useLocalList(RECENT_KEY);
  const [favorites, setFavorites] = useLocalList(FAVORITES_KEY);
  const [stageWidth, setStageWidth] = React.useState(800);
  const [spaceDown, setSpaceDown] = React.useState(false);
  const [paletteDrag, setPaletteDrag] = React.useState<{
    tool: ToolDef;
    x: number;
    y: number;
  } | null>(null);
  const [printing, setPrinting] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "png" | "pdf">(null);

  // playback
  const [playMode, setPlayMode] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState<(typeof SPEEDS)[number]>(1);
  const [clock, setClock] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const gesture = React.useRef<Gesture>({ kind: "none" });
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const spaceHeld = React.useRef(false);
  const clipboard = React.useRef<Fragment | null>(null);
  const pasteCount = React.useRef(0);
  const frame = React.useRef<number | null>(null);
  const liftedSound = React.useRef(false);

  // ---- derived ------------------------------------------------------------------------------
  // the step never points past the last one; the selection never holds what no longer exists; the view follows the court
  const stepCount = stepCountOf(d);
  const step = Math.min(stepState, stepCount);
  const selection = React.useMemo(() => pruneSelection(selectionState, d), [selectionState, d]);
  const view = viewState.court === courtId ? viewState.view : wholeCourt(box);
  const setView = React.useCallback(
    (next: View | ((v: View) => View)) =>
      setViewState((cur) => ({
        court: courtId,
        view:
          typeof next === "function"
            ? next(cur.court === courtId ? cur.view : wholeCourt(box))
            : next,
      })),
    [courtId, box],
  );
  const shown = ui.transient ?? d;
  const scene = React.useMemo(() => buildScene(d, pack, step), [d, pack, step]);
  const anchorNames = React.useMemo(() => Object.keys(pack.anchors), [pack]);
  const shownScene = React.useMemo(
    () => (ui.transient ? buildScene(ui.transient, pack, step) : scene),
    [ui.transient, pack, step, scene],
  );
  const timeline = React.useMemo(() => buildTimeline(d, pack), [d, pack]);
  const inventory = React.useMemo(() => countInventory(d), [d]);
  const locked = disabled || playMode;
  const empty = d.entities.length === 0 && d.actions.length === 0 && d.annotations.length === 0;

  // ---- naming -------------------------------------------------------------------------------
  const nameOf = React.useCallback(
    (id: string): string => {
      const e = d.entities.find((x) => x.id === id);
      if (!e) return id;
      switch (e.type) {
        case "player":
          return t(e.side === "offense" ? "names.offense" : "names.defense", {
            label: e.label ?? e.id,
          });
        case "coach":
          return t("names.coach", { label: e.label ?? "" }).trim();
        case "ball":
          return t("names.ball", { label: e.id.replace(/^\D+/, "") });
        case "cone":
          return t("names.cone", { label: e.label ?? e.id.replace(/^\D+/, "") });
        case "marker":
          return t("names.marker", { label: e.label ?? e.id });
        case "equipment":
          return e.label ? `${t(`equipment.${e.kind}`)} ${e.label}` : t(`equipment.${e.kind}`);
      }
    },
    [d.entities, t],
  );

  const issueText = React.useCallback(
    (issue: { code: string; params?: Record<string, string | number> } | undefined) => {
      if (!issue) return t("refused");
      const params = { ...(issue.params ?? {}) };
      if (typeof params.id === "string") params.id = nameOf(params.id);
      return tv.has(issue.code) ? tv(issue.code, params) : t("refused");
    },
    [nameOf, t, tv],
  );

  // ---- changes ------------------------------------------------------------------------------
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChangeRef.current(d);
  }, [d]);

  // the size of the court on screen, for handles that keep their size at any zoom
  React.useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStageWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const say = React.useCallback((message: string) => setAnnounce(message), []);

  /** Apply operations as ONE edit. Returns the new diagram, or null when refused (and says why). */
  const commit = React.useCallback(
    (
      ops: DiagramOp[],
      opts: {
        say?: string;
        sound?: "select" | "drop" | "duplicate" | "delete" | "step" | null;
      } = {},
    ): Diagram | null => {
      if (ops.length === 0) return d;
      const result = applyOps(d, ops, pack, packFor);
      if (!result.ok) {
        setError(issueText(result.issues[0]));
        sound.play("error");
        return null;
      }
      setError(null);
      if (JSON.stringify(result.diagram) === JSON.stringify(d)) return d;
      dispatch({ type: "commit", diagram: result.diagram });
      if (opts.say) say(opts.say);
      if (opts.sound !== null) sound.play(opts.sound ?? "drop");
      return result.diagram;
    },
    [d, dispatch, issueText, pack, packFor, say, sound],
  );

  const idsOf = (x: Diagram) => new Set(x.entities.map((e) => e.id));
  const selectNew = (before: Diagram, after: Diagram) => {
    const known = idsOf(before);
    const fresh = after.entities.filter(
      (e) => !known.has(e.id) && !(e.type === "ball" && e.heldBy),
    );
    const knownActions = new Set(before.actions.map((a) => a.id));
    const freshActions = after.actions.filter((a) => !knownActions.has(a.id));
    if (fresh.length) setSelection({ entities: fresh.map((e) => e.id), actions: [], notes: [] });
    else if (freshActions.length)
      setSelection({ entities: [], actions: freshActions.map((a) => a.id), notes: [] });
    else if (after.annotations.length > before.annotations.length)
      setSelection({ entities: [], actions: [], notes: [after.annotations.length - 1] });
  };

  // ---- coordinates and snapping -------------------------------------------------------------
  const toCourt = (clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  /** Court metres per screen pixel right now. */
  const unitNow = () => {
    const ctm = svgRef.current?.getScreenCTM();
    return ctm && ctm.a > 0 ? 1 / ctm.a : visibleBox(view, box).w / 800;
  };
  const clampToCourt = (p: Pt): Pt => {
    const b = pack.bounds;
    return {
      x: round2(Math.min(b.maxX, Math.max(b.minX, p.x))),
      y: round2(Math.min(b.maxY, Math.max(b.minY, p.y))),
    };
  };
  const snapAt = (p: Pt, exclude: readonly string[] = []) => {
    if (!snapOn) return { point: clampToCourt(p), guides: [] as SnapGuide[] };
    const others = scene.entities.filter((e) => !exclude.includes(e.entity.id)).map((e) => e.at);
    return snapPoint(p, pack, others, {
      grid: DEFAULT_GRID,
      courtLines: true,
      objects: true,
      radius: 12 * unitNow(),
    });
  };

  const setUiNow = (patch: Partial<Ui>) => setUi((u) => ({ ...u, ...patch }));
  const endGesture = () => {
    gesture.current = { kind: "none" };
    liftedSound.current = false;
    setUi(IDLE_UI);
  };
  const schedule = (fn: () => void) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      fn();
    });
  };
  React.useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  // ---- tools --------------------------------------------------------------------------------
  const remember = (id: string) =>
    setRecent((list) => [id, ...list.filter((x) => x !== id)].slice(0, 6));
  const toggleFavorite = (id: string) =>
    setFavorites((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const chooseSelect = () => {
    setTool(null);
    setPending(null);
    setTextDraft(null);
    setError(null);
  };

  /** A click on a tool card: a placeable object is added at a sensible spot; a drawing tool becomes the active tool. */
  const pickTool = (picked: ToolDef) => {
    if (locked) return;
    sound.play("select");
    remember(picked.id);
    setError(null);
    setPending(null);
    setTextDraft(null);
    if (picked.place) {
      const at = defaultSpot(
        picked.place,
        d.entities,
        scene.entities.map((e) => e.at),
        pack.anchors,
      );
      const ops = placeOps(picked.place, at, d, { number: numberDraft });
      const next = commit(ops, {
        say: t("announce.added", { what: t(`tools.${picked.id}`) }),
        sound: "drop",
      });
      if (next) selectNew(d, next);
      setTool(null);
      setPanel(null);
    } else {
      setTool((current) => (current?.id === picked.id ? null : picked));
      setSelection(NO_SELECTION);
      setPanel(null);
      say(t("announce.toolPicked", { what: t(`tools.${picked.id}`) }));
    }
  };

  // ---- drag from the library ------------------------------------------------------------------
  const beginPaletteDrag = (dragged: ToolDef, e: React.PointerEvent) => {
    if (locked || !dragged.place) return;
    sound.play("lift");
    setPaletteDrag({ tool: dragged, x: e.clientX, y: e.clientY });
    setTool(null);
    setPending(null);
    setPanel(null);
  };

  React.useEffect(() => {
    if (!paletteDrag) return;
    const spec = paletteDrag.tool.place!;
    const overCourt = (x: number, y: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
      const p = toCourt(x, y);
      if (!p) return null;
      return snapAt(p);
    };
    const move = (ev: PointerEvent) => {
      setPaletteDrag((cur) => (cur ? { ...cur, x: ev.clientX, y: ev.clientY } : cur));
      const over = overCourt(ev.clientX, ev.clientY);
      const b = pack.bounds;
      setUi((u) => ({
        ...u,
        drop: over
          ? { at: over.point, valid: over.point.x >= b.minX && over.point.x <= b.maxX }
          : null,
        guides: over?.guides ?? [],
      }));
    };
    const up = (ev: PointerEvent) => {
      const over = overCourt(ev.clientX, ev.clientY);
      const dragged = paletteDrag.tool;
      setPaletteDrag(null);
      setUi(IDLE_UI);
      if (!over) return;
      const under = hitTest(over.point, scene, 0.1);
      const carrier =
        under?.kind === "entity"
          ? scene.entities.find((e) => e.entity.id === under.id && isCarrier(e.entity))
          : undefined;
      const ops = placeOps(spec, over.point, d, {
        number: numberDraft,
        dropOn: carrier
          ? {
              id: carrier.entity.id,
              hasBall: d.entities.some((x) => x.type === "ball" && x.heldBy === carrier.entity.id),
            }
          : null,
      });
      remember(dragged.id);
      const next = commit(ops, {
        say: t("announce.added", { what: t(`tools.${dragged.id}`) }),
        sound: "drop",
      });
      if (next) selectNew(d, next);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setPaletteDrag(null);
        setUi(IDLE_UI);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    };
    // the drag is one gesture: its handlers close over the diagram as it was when it began
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteDrag?.tool.id]);

  // ---- selection actions ----------------------------------------------------------------------
  const doDuplicate = () => {
    if (locked || isNothing(selection)) return;
    const fragment = buildFragment(d, scene, selection);
    if (fragmentSize(fragment) === 0) return;
    const next = commit(
      [
        {
          op: "paste",
          entities: fragment.entities,
          actions: fragment.actions,
          annotations: fragment.annotations,
          dx: 0.9,
          dy: 0.9,
        },
      ],
      { say: t("announce.duplicated"), sound: "duplicate" },
    );
    if (next) selectNew(d, next);
  };
  const doDelete = () => {
    if (locked || isNothing(selection)) return;
    const ops = deleteOps(d, selection);
    if (ops.length && commit(ops, { say: t("announce.removed"), sound: "delete" }))
      setSelection(NO_SELECTION);
  };
  const doCopy = () => {
    if (isNothing(selection)) return;
    clipboard.current = buildFragment(d, scene, selection);
    pasteCount.current = 0;
    say(t("announce.copied", { count: fragmentSize(clipboard.current) }));
  };
  const doPaste = () => {
    const f = clipboard.current;
    if (locked || !f || fragmentSize(f) === 0) return;
    pasteCount.current += 1;
    const shift = 0.9 * pasteCount.current;
    const next = commit(
      [
        {
          op: "paste",
          entities: f.entities,
          actions: f.actions,
          annotations: f.annotations,
          dx: shift,
          dy: shift,
        },
      ],
      { say: t("announce.pasted"), sound: "duplicate" },
    );
    if (next) selectNew(d, next);
  };
  const doUndo = () => {
    if (locked || !canUndo(state)) return;
    dispatch({ type: "undo" });
    sound.play("undo");
    say(t("announce.undone"));
  };
  const doRedo = () => {
    if (locked || !canRedo(state)) return;
    dispatch({ type: "redo" });
    sound.play("redo");
    say(t("announce.redone"));
  };
  const doRotate = (by: number) => {
    if (locked) return;
    const ops = rotateOps(scene, selection.entities, by);
    if (ops.length) commit(ops, { sound: "select" });
  };
  const nudge = (dx: number, dy: number) => {
    if (locked || (selection.entities.length === 0 && selection.notes.length === 0)) return;
    const ops = [
      ...dragOps(d, scene, selection.entities, dx, dy, step),
      ...selection.notes.map((index) => ({ op: "move_annotation" as const, index, dx, dy })),
    ];
    commit(ops, { say: t("announce.moved"), sound: null });
  };

  // ---- steps ----------------------------------------------------------------------------------
  const goToStep = (n: number) => {
    if (n === step) return;
    setStep(n);
    setSelection(NO_SELECTION);
    setPending(null);
    sound.play("step");
    say(t("announce.step", { n }));
  };

  // ---- the canvas: pointer gestures ------------------------------------------------------------
  const finishAction = (ops: DiagramOp[], what: string) => {
    const next = commit(ops, { say: t("announce.added", { what }), sound: "drop" });
    if (next) {
      const known = new Set(d.actions.map((a) => a.id));
      const created = next.actions.find((a) => !known.has(a.id));
      if (created) setSelection({ entities: [], actions: [created.id], notes: [] });
    }
    return next;
  };

  const carrierAt = (p: Pt, slop: number) => {
    const hit = hitTest(p, scene, slop);
    if (hit?.kind !== "entity") return null;
    const e = scene.entities.find((x) => x.entity.id === hit.id);
    return e && isCarrier(e.entity) ? e : null;
  };

  const pathAction = (
    spec: Extract<DrawSpec, { mode: "path" }>,
    actor: string,
    points: Pt[],
  ): DiagramOp => {
    const path = points.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
    const curve = spec.type !== "defend" && spec.curve ? { curve: spec.curve } : {};
    return spec.type === "defend"
      ? { op: "add_action", action: { type: "defend", kind: spec.kind, entity: actor, path, step } }
      : { op: "add_action", action: { type: spec.type, entity: actor, path, step, ...curve } };
  };

  const finishPending = () => {
    if (pending?.kind === "path" && pending.points.length > 0) {
      finishAction(
        [pathAction(pending.spec, pending.actor, pending.points)],
        t(`tools.${tool?.id ?? "move"}`),
      );
    }
    setPending(null);
    setUi(IDLE_UI);
  };

  const beginDraw = (spec: DrawSpec, p: Pt, slop: number) => {
    const under = carrierAt(p, slop);
    switch (spec.mode) {
      case "path":
        if (pending?.kind === "path") {
          gesture.current = {
            kind: "path",
            actor: pending.actor,
            spec,
            start: p,
            current: p,
            moved: false,
          };
          return;
        }
        if (!under) return setError(t("needCarrier"));
        gesture.current = {
          kind: "path",
          actor: under.entity.id,
          spec,
          start: under.at,
          current: p,
          moved: false,
        };
        return;
      case "pass":
      case "screen":
      case "shot":
        if (pending?.kind === "link") {
          gesture.current = {
            kind: "link",
            actor: pending.actor,
            spec,
            start: scene.entities.find((e) => e.entity.id === pending.actor)?.at ?? p,
            current: p,
            moved: false,
          };
          return;
        }
        if (!under) return setError(t("needCarrier"));
        gesture.current = {
          kind: "link",
          actor: under.entity.id,
          spec,
          start: under.at,
          current: p,
          moved: false,
        };
        return;
      case "text":
      case "mark":
        gesture.current = { kind: "shape", spec, start: p, current: p, points: [p], moved: false };
        return;
      case "zone":
      case "circle":
      case "freehand":
        gesture.current = { kind: "shape", spec, start: p, current: p, points: [p], moved: false };
        return;
    }
  };

  const beginSelect = (p: Pt, e: React.PointerEvent, slop: number) => {
    const unit = unitNow();
    // handles of what is selected come first
    const only =
      selection.entities.length === 1 &&
      selection.actions.length === 0 &&
      selection.notes.length === 0;
    if (only) {
      const se = scene.entities.find((x) => x.entity.id === selection.entities[0]);
      if (se && se.entity.type !== "ball") {
        const h = handlePoints(se, unit);
        if (dist(p, h.rotate.at) <= 11 * unit) {
          gesture.current = { kind: "rotate", id: se.entity.id, center: se.at, result: null };
          return;
        }
        if (dist(p, h.resize) <= 11 * unit) {
          const scale = "scale" in se.entity && se.entity.scale ? se.entity.scale : 1;
          const base = Math.hypot(se.halfW / scale, se.halfH / scale);
          gesture.current = { kind: "resize", id: se.entity.id, center: se.at, base, result: null };
          return;
        }
      }
    }
    if (
      selection.actions.length === 1 &&
      selection.entities.length === 0 &&
      selection.notes.length === 0
    ) {
      const sa = scene.actions.find((a) => a.id === selection.actions[0]);
      const action = d.actions.find((a) => a.id === selection.actions[0]);
      if (sa && action) {
        const movable =
          action.type !== "pass" && action.type !== "shot" && action.type !== "screen";
        if (movable) {
          for (let i = 1; i < sa.points.length; i++) {
            if (dist(p, sa.points[i]!) <= 11 * unit) {
              gesture.current = { kind: "handle", action: sa.id, index: i - 1, result: null };
              return;
            }
          }
        }
        const a0 = sa.points[0]!;
        const a1 = sa.points[Math.min(1, sa.points.length - 1)]!;
        const curveNow = "curve" in action && action.curve ? action.curve : 0;
        const apex = curveApex(a0, a1, curveNow);
        if (dist(p, apex) <= 11 * unit) {
          gesture.current = { kind: "curve", action: sa.id, result: null };
          return;
        }
      }
    }

    const hit = hitTest(p, scene, slop);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!hit) {
      gesture.current = { kind: "marquee", start: p, current: p, additive, moved: false };
      return;
    }
    const next =
      hit.kind === "entity" && selection.entities.includes(hit.id) && !additive
        ? selection
        : selectHit(selection, hit, additive);
    setSelection(next);
    if (hit.kind === "action") return;
    const grabbing =
      hit.kind === "entity"
        ? next.entities.includes(hit.id)
        : hit.kind === "note"
          ? next.notes.includes(hit.index)
          : false;
    if (!grabbing) return;
    const primary =
      hit.kind === "entity" ? scene.entities.find((x) => x.entity.id === hit.id)!.at : p;
    gesture.current = {
      kind: "drag",
      ids: [...next.entities],
      notes: [...next.notes],
      start: p,
      origin: primary,
      moved: false,
      delta: { x: 0, y: 0 },
    };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (playMode) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = toCourt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2) ?? { x: view.cx, y: view.cy };
      gesture.current = {
        kind: "pinch",
        distance: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        view,
        mid,
      };
      setUi(IDLE_UI);
      return;
    }
    rootRef.current?.focus({ preventScroll: true });
    if (e.button === 1 || spaceHeld.current) {
      gesture.current = { kind: "pan", startX: e.clientX, startY: e.clientY, view };
      e.preventDefault();
      return;
    }
    if (e.button !== 0 || disabled) return;
    const p = toCourt(e.clientX, e.clientY);
    if (!p) return;
    if (textDraft) commitText();
    const slop = e.pointerType === "touch" ? 0.45 : 0.12;
    if (tool?.draw) beginDraw(tool.draw, p, slop);
    else beginSelect(p, e, slop);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === "none") {
      // hovering with a drawing tool: show the line that would be drawn
      if (pending && !playMode) {
        const p = toCourt(e.clientX, e.clientY);
        if (!p) return;
        schedule(() => {
          if (pending.kind === "path") {
            const from = scene.entities.find((x) => x.entity.id === pending.actor)?.at;
            if (from)
              setUiNow({
                preview: { kind: "line", points: [from, ...pending.points, snapAt(p).point] },
              });
          } else {
            const from = scene.entities.find((x) => x.entity.id === pending.actor)?.at;
            if (from) setUiNow({ preview: { kind: "line", points: [from, p] } });
          }
        });
      }
      return;
    }
    if (g.kind === "pan") {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vb = visibleBox(g.view, box);
      setView(
        panBy(
          g.view,
          box,
          (-(e.clientX - g.startX) * vb.w) / rect.width,
          (-(e.clientY - g.startY) * vb.h) / rect.height,
        ),
      );
      return;
    }
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const now = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (g.distance > 0) setView(zoomAt(g.view, box, now / g.distance, g.mid));
      return;
    }
    const raw = toCourt(e.clientX, e.clientY);
    if (!raw) return;
    const unit = unitNow();
    switch (g.kind) {
      case "drag": {
        const moved = g.moved || dist(raw, g.start) > 5 * unit;
        if (moved && !g.moved && !liftedSound.current) {
          liftedSound.current = true;
          sound.play("lift");
        }
        const primary = {
          x: g.origin.x + (raw.x - g.start.x),
          y: g.origin.y + (raw.y - g.start.y),
        };
        const snapped =
          g.ids.length > 0 ? snapAt(primary, g.ids) : { point: primary, guides: [] as SnapGuide[] };
        const delta = { x: snapped.point.x - g.origin.x, y: snapped.point.y - g.origin.y };
        gesture.current = { ...g, moved, delta };
        if (moved)
          schedule(() => setUiNow({ dragDelta: delta, guides: snapped.guides, dragIds: g.ids }));
        return;
      }
      case "marquee": {
        const moved = g.moved || dist(raw, g.start) > 5 * unit;
        gesture.current = { ...g, current: raw, moved };
        if (moved) schedule(() => setUiNow({ preview: { kind: "marquee", a: g.start, b: raw } }));
        return;
      }
      case "rotate": {
        let deg = (Math.atan2(raw.x - g.center.x, -(raw.y - g.center.y)) * 180) / Math.PI;
        if (e.shiftKey || snapOn) {
          const nearest = Math.round(deg / 15) * 15;
          if (e.shiftKey || Math.abs(deg - nearest) < 4) deg = nearest;
        }
        const result = Math.max(-180, Math.min(180, Math.round(deg)));
        gesture.current = { ...g, result };
        schedule(() => {
          const r = applyOps(
            d,
            [{ op: "set_props", ids: [g.id], rotation: result }],
            pack,
            packFor,
          );
          if (r.ok) setUiNow({ transient: r.diagram });
        });
        return;
      }
      case "resize": {
        const raw2 = dist(raw, g.center) / Math.max(0.2, g.base);
        const result = Math.max(0.5, Math.min(3, Math.round(raw2 * 20) / 20));
        gesture.current = { ...g, result };
        schedule(() => {
          const r = applyOps(d, [{ op: "set_props", ids: [g.id], scale: result }], pack, packFor);
          if (r.ok) setUiNow({ transient: r.diagram });
        });
        return;
      }
      case "handle": {
        const result = snapAt(raw).point;
        gesture.current = { ...g, result };
        schedule(() => {
          const action = d.actions.find((a) => a.id === g.action);
          if (!action || !("path" in action)) return;
          const path = action.path.map((p, i) => (i === g.index ? result : p));
          const r = applyOps(d, [{ op: "set_path", id: g.action, path }], pack, packFor);
          if (r.ok) setUiNow({ transient: r.diagram, guides: [] });
        });
        return;
      }
      case "curve": {
        const sa = scene.actions.find((a) => a.id === g.action);
        if (!sa) return;
        const a0 = sa.points[0]!;
        const a1 = sa.points[Math.min(1, sa.points.length - 1)]!;
        const len = dist(a0, a1) || 1;
        const nx = -(a1.y - a0.y) / len;
        const ny = (a1.x - a0.x) / len;
        const mid = { x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2 };
        const apex = -((raw.x - mid.x) * nx + (raw.y - mid.y) * ny);
        const result = Math.max(-1, Math.min(1, Math.round(((4 * apex) / len) * 10) / 10));
        gesture.current = { ...g, result };
        schedule(() => {
          const r = applyOps(d, [{ op: "set_action", id: g.action, curve: result }], pack, packFor);
          if (r.ok) setUiNow({ transient: r.diagram });
        });
        return;
      }
      case "path": {
        const moved = g.moved || dist(raw, g.start) > 6 * unit;
        const point = snapAt(raw).point;
        gesture.current = { ...g, current: point, moved };
        schedule(() => {
          const from = scene.entities.find((x) => x.entity.id === g.actor)?.at ?? g.start;
          const via = pending?.kind === "path" ? pending.points : [];
          setUiNow({ preview: { kind: "line", points: [from, ...via, point] } });
        });
        return;
      }
      case "link": {
        const moved = g.moved || dist(raw, g.start) > 6 * unit;
        gesture.current = { ...g, current: raw, moved };
        schedule(() => setUiNow({ preview: { kind: "line", points: [g.start, raw] } }));
        return;
      }
      case "shape": {
        const moved = g.moved || dist(raw, g.start) > 4 * unit;
        const points = g.spec.mode === "freehand" ? [...g.points, raw] : g.points;
        gesture.current = { ...g, current: raw, moved, points };
        schedule(() => {
          if (g.spec.mode === "zone") setUiNow({ preview: { kind: "rect", a: g.start, b: raw } });
          else if (g.spec.mode === "circle")
            setUiNow({ preview: { kind: "circle", center: g.start, radius: dist(g.start, raw) } });
          else if (g.spec.mode === "freehand") setUiNow({ preview: { kind: "freehand", points } });
        });
        return;
      }
    }
  };

  const commitText = () => {
    if (!textDraft) return;
    const value = textDraft.value.trim();
    setTextDraft(null);
    if (!value) return;
    const at = snapAt(textDraft.at).point;
    const next = commit([{ op: "add_text", at, text: value }], {
      say: t("announce.added", { what: t("tools.text") }),
      sound: "drop",
    });
    if (next) selectNew(d, next);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) gesture.current = { kind: "none" };
      return;
    }
    if (g.kind === "pan") {
      gesture.current = { kind: "none" };
      return;
    }
    const raw = toCourt(e.clientX, e.clientY);
    const unit = unitNow();
    switch (g.kind) {
      case "drag": {
        if (g.moved) {
          const ops = [
            ...dragOps(d, scene, g.ids, g.delta.x, g.delta.y, step),
            ...g.notes.map((index) => ({
              op: "move_annotation" as const,
              index,
              dx: round2(g.delta.x),
              dy: round2(g.delta.y),
            })),
          ];
          endGesture();
          commit(ops, { say: t("announce.moved"), sound: "drop" });
          return;
        }
        break;
      }
      case "marquee": {
        if (g.moved && raw) {
          setSelection(marqueeSelect(g.start, raw, scene, g.additive ? selection : NO_SELECTION));
        } else if (!g.additive) setSelection(NO_SELECTION);
        break;
      }
      case "rotate": {
        if (g.result !== null)
          commit([{ op: "set_props", ids: [g.id], rotation: g.result }], { sound: "select" });
        break;
      }
      case "resize": {
        if (g.result !== null)
          commit([{ op: "set_props", ids: [g.id], scale: g.result }], { sound: "select" });
        break;
      }
      case "handle": {
        const action = d.actions.find((a) => a.id === g.action);
        if (g.result && action && "path" in action) {
          const path = action.path.map((p, i) => (i === g.index ? g.result! : p));
          commit([{ op: "set_path", id: g.action, path }], { sound: "drop" });
        }
        break;
      }
      case "curve": {
        if (g.result !== null)
          commit([{ op: "set_action", id: g.action, curve: g.result }], { sound: "select" });
        break;
      }
      case "path": {
        if (g.moved) {
          const via = pending?.kind === "path" ? pending.points : [];
          setPending(null);
          endGesture();
          finishAction(
            [pathAction(g.spec, g.actor, [...via, g.current])],
            t(`tools.${tool?.id ?? "move"}`),
          );
          return;
        }
        if (pending?.kind === "path") {
          const point = snapAt(raw ?? g.current).point;
          if (pending.points.length >= 7) setError(t("pathFull"));
          else setPending({ ...pending, points: [...pending.points, point] });
        } else {
          setPending({ kind: "path", actor: g.actor, spec: g.spec, points: [] });
          sound.play("select");
        }
        break;
      }
      case "link": {
        const target = raw ? carrierAt(raw, e.pointerType === "touch" ? 0.45 : 0.12) : null;
        const spec = g.spec;
        const dragged = g.moved;
        if (spec.mode === "pass") {
          if (target && target.entity.id !== g.actor) {
            setPending(null);
            endGesture();
            finishAction(
              [
                {
                  op: "add_action",
                  action: {
                    type: "pass",
                    from: g.actor,
                    to: target.entity.id,
                    kind: spec.kind === "standard" ? undefined : spec.kind,
                    step,
                  },
                },
              ],
              t(`tools.${tool?.id ?? "pass"}`),
            );
            return;
          }
          if (!dragged) {
            if (pending?.kind === "link" && pending.actor === g.actor) setPending(null);
            else if (!pending) {
              setPending({ kind: "link", actor: g.actor, spec });
              sound.play("select");
            }
          } else setError(t("needReceiver"));
        } else if (spec.mode === "shot") {
          const goal = pack.primaryTarget;
          const to = raw && dragged && dist(raw, goal) > 1.4 ? snapAt(raw).point : null;
          setPending(null);
          endGesture();
          finishAction(
            [
              {
                op: "add_action",
                action: { type: "shot", entity: g.actor, ...(to ? { to } : {}), step },
              },
            ],
            t("tools.shot"),
          );
          return;
        } else if (spec.mode === "screen") {
          if (target && target.entity.id !== g.actor) {
            setPending(null);
            endGesture();
            finishAction(
              [
                {
                  op: "add_action",
                  action: {
                    type: "screen",
                    entity: g.actor,
                    target: { entity: target.entity.id },
                    kind: spec.kind,
                    step,
                  },
                },
              ],
              t(`tools.${tool?.id ?? "screenBall"}`),
            );
            return;
          }
          if (dragged && raw) {
            const to = snapAt(raw).point;
            setPending(null);
            endGesture();
            finishAction(
              [
                {
                  op: "add_action",
                  action: { type: "screen", entity: g.actor, target: to, kind: spec.kind, step },
                },
              ],
              t(`tools.${tool?.id ?? "screenBall"}`),
            );
            return;
          }
          if (!dragged && !pending) {
            setPending({ kind: "link", actor: g.actor, spec });
            sound.play("select");
          }
        }
        break;
      }
      case "shape": {
        const spec = g.spec;
        if (spec.mode === "text") {
          if (raw) setTextDraft({ at: raw, value: "" });
        } else if (spec.mode === "mark" && raw) {
          const at = snapAt(raw).point;
          const next = commit([{ op: "add_mark", kind: spec.kind, at }], {
            say: t("announce.added", { what: t(`tools.${tool?.id ?? "markX"}`) }),
            sound: "drop",
          });
          if (next) selectNew(d, next);
        } else if (spec.mode === "zone" && raw && g.moved && dist(g.start, raw) > 0.6) {
          const a = snapAt(g.start).point;
          const b = snapAt(raw).point;
          const next = commit([{ op: "add_zone", from: a, to: b }], {
            say: t("announce.added", { what: t("tools.rectangle") }),
            sound: "drop",
          });
          if (next) selectNew(d, next);
        } else if (spec.mode === "circle" && raw && g.moved && dist(g.start, raw) > 0.5) {
          const center = snapAt(g.start).point;
          const radius = Math.max(0.5, Math.min(10, round2(dist(g.start, raw))));
          const next = commit(
            [{ op: "add_circle", center, radius, ...(spec.color ? { color: spec.color } : {}) }],
            {
              say: t("announce.added", { what: t(`tools.${tool?.id ?? "circle"}`) }),
              sound: "drop",
            },
          );
          if (next) selectNew(d, next);
        } else if (spec.mode === "freehand" && g.points.length > 2) {
          const points = thin(g.points, 48);
          const next = commit([{ op: "add_freehand", points }], {
            say: t("announce.added", { what: t("tools.freehand") }),
            sound: "drop",
          });
          if (next) selectNew(d, next);
        }
        break;
      }
    }
    void unit;
    endGesture();
  };

  const onPointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (gesture.current.kind === "pinch" && pointers.current.size >= 2) return;
    endGesture();
  };

  const onDoubleClick = () => {
    if (pending?.kind === "path") finishPending();
  };

  // wheel zoom needs a non-passive native listener (React's onWheel cannot cancel the page scroll)
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const focus = toCourt(ev.clientX, ev.clientY);
      if (!focus) return;
      const factor = Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0016));
      setView((v) => zoomAt(v, box, factor, focus));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // toCourt reads the current svg matrix each call
  }, [box, playMode, setView]);

  // ---- zoom buttons ---------------------------------------------------------------------------
  const zoomBy = (factor: number) => setView((v) => zoomAt(v, box, factor, { x: v.cx, y: v.cy }));
  const fitCourt = () => setView(fitToContent(scene, box));
  const resetView = () => setView(wholeCourt(box));

  // ---- keyboard --------------------------------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, select, textarea, [contenteditable='true'], [role='menu']")) {
      if (e.key === "Escape" && target.closest("input")) (target as HTMLInputElement).blur();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
    } else if (mod && key === "y") {
      e.preventDefault();
      doRedo();
    } else if (mod && key === "c") {
      e.preventDefault();
      doCopy();
    } else if (mod && key === "x") {
      e.preventDefault();
      doCopy();
      doDelete();
    } else if (mod && key === "v") {
      e.preventDefault();
      doPaste();
    } else if (mod && key === "d") {
      e.preventDefault();
      doDuplicate();
    } else if (mod && key === "a") {
      e.preventDefault();
      if (!locked)
        setSelection({
          entities: scene.entities
            .filter((x) => !(x.entity.type === "ball" && x.entity.heldBy))
            .map((x) => x.entity.id),
          actions: [],
          notes: d.annotations.map((_, i) => i),
        });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      doDelete();
    } else if (e.key === "Escape") {
      if (pending || textDraft) {
        setPending(null);
        setTextDraft(null);
        setUi(IDLE_UI);
      } else if (tool) chooseSelect();
      else if (!isNothing(selection)) setSelection(NO_SELECTION);
      else if (playMode) stopPlay();
      else if (fullscreen) exitFullscreen();
    } else if (e.key === "Enter" && pending?.kind === "path") {
      e.preventDefault();
      finishPending();
    } else if (e.key.startsWith("Arrow")) {
      if (isNothing(selection)) return;
      e.preventDefault();
      const s = e.shiftKey ? 1 : 0.25;
      nudge(
        e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0,
        e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0,
      );
    } else if (!mod && key === "r") {
      e.preventDefault();
      doRotate(e.shiftKey ? -15 : 15);
    } else if (!mod && key === "v") chooseSelect();
    else if (!mod && (e.key === "+" || e.key === "=")) zoomBy(1.25);
    else if (!mod && e.key === "-") zoomBy(0.8);
    else if (!mod && e.key === "0") resetView();
    else if (e.key === " " && !e.repeat) {
      e.preventDefault();
      spaceHeld.current = true;
      setSpaceDown(true);
    }
  };
  const onKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " ") {
      spaceHeld.current = false;
      setSpaceDown(false);
    }
  };

  // ---- playback --------------------------------------------------------------------------------
  const stopPlay = () => {
    setPlaying(false);
    setPlayMode(false);
    setClock(0);
  };
  React.useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setClock((c) => {
        const next = c + dt * speed;
        if (next >= timeline.duration) {
          setPlaying(false);
          return timeline.duration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, timeline.duration]);

  const togglePlay = () => {
    if (timeline.duration === 0) return setError(t("nothingToPlay"));
    setError(null);
    if (playing) {
      setPlaying(false);
      say(t("announce.paused"));
      return;
    }
    setSelection(NO_SELECTION);
    setPending(null);
    setTool(null);
    setPlayMode(true);
    if (clock >= timeline.duration) setClock(0);
    setPlaying(true);
    sound.play("play");
    say(t("announce.playing"));
  };
  const restart = () => {
    if (timeline.duration === 0) return setError(t("nothingToPlay"));
    setError(null);
    setSelection(NO_SELECTION);
    setPlayMode(true);
    setClock(0);
    setPlaying(true);
    sound.play("play");
  };
  const playFrame = playMode ? timeline.frameAt(clock) : null;
  const shownStep = playFrame && playFrame.step > 0 ? playFrame.step : step;

  // ---- full screen -----------------------------------------------------------------------------
  const enterFullscreen = async () => {
    setFullscreen(true);
    try {
      await rootRef.current?.requestFullscreen?.();
    } catch {
      /* the window-filling layout below is enough */
    }
  };
  const exitFullscreen = () => {
    setFullscreen(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };
  React.useEffect(() => {
    const onChangeFs = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChangeFs);
    return () => document.removeEventListener("fullscreenchange", onChangeFs);
  }, []);
  React.useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  // ---- exporting -------------------------------------------------------------------------------
  const drillTitle = title?.trim() || t("export.untitled");
  const summary = () => {
    const parts = [
      t("export.players", {
        count: inventory.players.offense + inventory.players.defense + inventory.players.coaches,
      }),
      ...inventory.items.map((i) =>
        t("inventory.item", {
          count: i.count,
          name: t(`inventory.names.${i.key}`, { count: i.count }),
        }),
      ),
    ];
    return parts.join(" · ");
  };
  const exportPng = async () => {
    setBusy("png");
    try {
      downloadBlob(await courtPng(d, pack, { step: undefined }), fileName(drillTitle, "png"));
      sound.play("save");
      say(t("announce.exported"));
    } catch {
      setError(t("export.failed"));
      sound.play("error");
    } finally {
      setBusy(null);
    }
  };
  const stepList = Array.from({ length: stepCount }, (_, i) => i + 1);
  const stepCaption = (n: number) => {
    const named = d.stepTitles?.[String(n)];
    return named ? t("export.stepNamed", { n, title: named }) : t("steps.step", { n });
  };
  const exportPdf = async () => {
    setBusy("pdf");
    try {
      const blob = await drillSheetPdf(d, pack, stepList, {
        title: drillTitle,
        summary: summary(),
        stepCaption,
      });
      downloadBlob(blob, fileName(drillTitle, "pdf"));
      sound.play("save");
      say(t("announce.exported"));
    } catch {
      setError(t("export.failed"));
      sound.play("error");
    } finally {
      setBusy(null);
    }
  };
  const printSheet = () => setPrinting(true);
  React.useEffect(() => {
    if (!printing) return;
    document.body.dataset.printDiagram = "1";
    const done = () => {
      delete document.body.dataset.printDiagram;
      setPrinting(false);
    };
    window.addEventListener("afterprint", done, { once: true });
    const id = window.setTimeout(() => window.print(), 60);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("afterprint", done);
      delete document.body.dataset.printDiagram;
    };
  }, [printing]);

  // ---- templates -------------------------------------------------------------------------------
  const applyTemplate = (tpl: WorkspaceTemplate) => {
    const parsed = diagramSchema.safeParse(tpl.diagram);
    if (!parsed.success) return setError(t("refused"));
    const p = getCourtPack(parsed.data.sport, parsed.data.court);
    if (!p || validateDiagram(parsed.data, p).length > 0) return setError(t("refused"));
    dispatch({ type: "commit", diagram: parsed.data });
    setSelection(NO_SELECTION);
    setStep(1);
    sound.play("duplicate");
    say(t("announce.templateApplied"));
  };

  // ---- what to draw -------------------------------------------------------------------------------
  const hint = playMode
    ? t("hint.playing")
    : pending?.kind === "path"
      ? t("hint.pathPending", { count: pending.points.length })
      : pending?.kind === "link"
        ? t("hint.linkPending")
        : tool?.draw
          ? t(`hint.${tool.draw.mode}`)
          : t("hint.select");

  const actionHandles = (() => {
    if (selection.actions.length !== 1 || selection.entities.length > 0 || ui.transient)
      return null;
    const sa = scene.actions.find((a) => a.id === selection.actions[0]);
    const action = d.actions.find((a) => a.id === selection.actions[0]);
    if (!sa || !action) return null;
    const movable = action.type !== "pass" && action.type !== "shot" && action.type !== "screen";
    const curve = "curve" in action && action.curve ? action.curve : 0;
    return {
      points: movable ? sa.points : [sa.points[0]!],
      curve: curveApex(sa.points[0]!, sa.points[Math.min(1, sa.points.length - 1)]!, curve),
    };
  })();

  const dragPositions = React.useMemo(() => {
    if (!ui.dragDelta || selection.entities.length === 0) return undefined;
    const map = new Map<string, Pt>();
    const delta = ui.dragDelta;
    const ids = ui.dragIds.length > 0 ? ui.dragIds : selection.entities;
    for (const id of ids) {
      const e = scene.entities.find((x) => x.entity.id === id);
      if (!e) continue;
      map.set(id, { x: e.at.x + delta.x, y: e.at.y + delta.y });
      if (isCarrier(e.entity)) {
        for (const b of d.entities) {
          if (b.type === "ball" && b.heldBy === id) {
            const be = scene.entities.find((x) => x.entity.id === b.id);
            if (be) map.set(b.id, { x: be.at.x + delta.x, y: be.at.y + delta.y });
          }
        }
      }
    }
    return map;
  }, [ui.dragDelta, ui.dragIds, selection.entities, scene, d.entities]);

  const positions = playFrame ? playFrame.positions : dragPositions;
  const vb = viewBoxString(view, box);
  const vis = visibleBox(view, box);
  const unit = vis.w / Math.max(200, stageWidth);

  const selectionBox = (() => {
    if (isNothing(selection) || playMode || ui.dragDelta) return null;
    const pts: Pt[] = [];
    for (const id of selection.entities) {
      const e = scene.entities.find((x) => x.entity.id === id);
      if (e)
        pts.push(
          { x: e.at.x - e.halfW, y: e.at.y - e.halfH },
          { x: e.at.x + e.halfW, y: e.at.y + e.halfH },
        );
    }
    for (const id of selection.actions) {
      const a = scene.actions.find((x) => x.id === id);
      if (a) pts.push(...a.points);
    }
    for (const i of selection.notes) {
      const n = scene.notes.find((x) => x.index === i);
      if (n) pts.push({ x: n.box.minX, y: n.box.minY }, { x: n.box.maxX, y: n.box.maxY });
    }
    if (pts.length === 0) return null;
    return {
      x: (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2,
      y: Math.min(...pts.map((p) => p.y)),
    };
  })();
  const toolbarStyle = selectionBox
    ? {
        left: `${Math.max(10, Math.min(90, ((selectionBox.x - vis.x) / vis.w) * 100))}%`,
        top: `${Math.max(2, ((selectionBox.y - vis.y) / vis.h) * 100)}%`,
      }
    : null;

  const single = selectionSize(selection) === 1 ? selection : null;
  const selectedEntity = single?.entities[0]
    ? d.entities.find((e) => e.id === single.entities[0])
    : undefined;
  const cursor = playMode ? "default" : spaceDown ? "grab" : tool?.draw ? "crosshair" : "default";

  const iconBtn = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    opts: { disabled?: boolean; pressed?: boolean; testId?: string } = {},
  ) => (
    <Tooltip label={label}>
      <Button
        type="button"
        variant={opts.pressed ? "primary" : "secondary"}
        size="icon"
        className="size-10"
        aria-label={label}
        aria-pressed={opts.pressed}
        disabled={opts.disabled}
        data-testid={opts.testId}
        onClick={onClick}
      >
        {icon}
      </Button>
    </Tooltip>
  );

  const libraryPanel = (
    <ToolLibrary
      activeToolId={tool?.id ?? null}
      onPick={pickTool}
      onDragStart={beginPaletteDrag}
      disabled={locked}
      recent={recent}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
      number={numberDraft}
      onNumber={setNumberDraft}
    />
  );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="diagram-workspace"
      data-step={step}
      data-tool={tool?.id ?? "select"}
      className={cn(
        "outline-none",
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col gap-3 overflow-auto bg-surface p-3"
          : "space-y-3",
      )}
    >
      <p role="status" aria-live="polite" className="sr-only" data-testid="workspace-status">
        {announce}
      </p>

      {/* toolbar */}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface-raised p-2"
        role="toolbar"
        aria-label={t("toolbar.label")}
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="lg:hidden"
          aria-expanded={panel === "tools"}
          onClick={() => setPanel(panel === "tools" ? null : "tools")}
          data-testid="open-tools"
        >
          <Wrench className="size-4" aria-hidden />
          {t("toolbar.tools")}
        </Button>
        {iconBtn(
          t("toolbar.select"),
          <MousePointer2 className="size-4" aria-hidden />,
          chooseSelect,
          {
            pressed: tool === null && !playMode,
            disabled: locked,
            testId: "tool-select",
          },
        )}
        <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" aria-hidden />
        {iconBtn(t("toolbar.undo"), <Undo2 className="size-4" aria-hidden />, doUndo, {
          disabled: locked || !canUndo(state),
          testId: "undo",
        })}
        {iconBtn(t("toolbar.redo"), <Redo2 className="size-4" aria-hidden />, doRedo, {
          disabled: locked || !canRedo(state),
          testId: "redo",
        })}
        <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" aria-hidden />
        {iconBtn(
          snapOn ? t("toolbar.snapOn") : t("toolbar.snapOff"),
          <Magnet className="size-4" aria-hidden />,
          () => setSnapOn((v) => !v),
          {
            pressed: snapOn,
            testId: "snap",
          },
        )}
        {iconBtn(
          t("toolbar.zoomOut"),
          <ZoomOut className="size-4" aria-hidden />,
          () => zoomBy(0.8),
          { testId: "zoom-out" },
        )}
        <span
          className="min-w-12 text-center text-xs text-ink-muted tabular-nums"
          data-testid="zoom-level"
        >
          {Math.round(view.scale * 100)}%
        </span>
        {iconBtn(
          t("toolbar.zoomIn"),
          <ZoomIn className="size-4" aria-hidden />,
          () => zoomBy(1.25),
          { testId: "zoom-in" },
        )}
        {iconBtn(t("toolbar.fit"), <Scan className="size-4" aria-hidden />, fitCourt, {
          testId: "fit-court",
        })}
        {iconBtn(t("toolbar.resetView"), <Hand className="size-4" aria-hidden />, resetView, {
          testId: "reset-view",
        })}
        <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" aria-hidden />
        <Button
          type="button"
          variant={playMode ? "primary" : "secondary"}
          size="sm"
          onClick={togglePlay}
          data-testid="play"
          aria-label={playing ? t("toolbar.pause") : t("toolbar.play")}
        >
          {playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )}
          {playing ? t("toolbar.pause") : t("toolbar.play")}
        </Button>
        {playMode ? (
          <>
            {iconBtn(t("toolbar.restart"), <RotateCcw className="size-4" aria-hidden />, restart, {
              testId: "restart",
            })}
            <div role="group" aria-label={t("toolbar.speed")} className="flex gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(s)}
                  data-testid={`speed-${s}`}
                  className={cn(
                    "h-10 min-w-11 rounded-md border px-2 text-xs font-medium tabular-nums",
                    speed === s
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={stopPlay}
              data-testid="stop-play"
            >
              <X className="size-4" aria-hidden />
              {t("toolbar.backToEditing")}
            </Button>
          </>
        ) : null}
        <span className="flex-1" />
        {templates && templates.length > 0 ? (
          <Menu>
            <MenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={locked}
                data-testid="templates"
              >
                <LayoutTemplate className="size-4" aria-hidden />
                {t("toolbar.templates")}
                <ChevronDown className="size-4" aria-hidden />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {templates.map((tpl) => (
                <MenuItem key={tpl.key} onSelect={() => applyTemplate(tpl)}>
                  {t(`templates.${tpl.key}`)}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : null}
        {iconBtn(
          sound.muted ? t("toolbar.unmute") : t("toolbar.mute"),
          sound.muted || !sound.enabled ? (
            <VolumeX className="size-4" aria-hidden />
          ) : (
            <Volume2 className="size-4" aria-hidden />
          ),
          () => sound.setMuted(!sound.muted),
          {
            pressed: sound.muted,
            testId: "mute-sounds",
          },
        )}
        <Menu>
          <MenuTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={busy !== null}
              data-testid="export-menu"
            >
              <Download className="size-4" aria-hidden />
              {t("export.label")}
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => void exportPng()}>
              <FileImage className="size-4" aria-hidden />
              {t("export.png")}
            </MenuItem>
            <MenuItem onSelect={() => void exportPdf()}>
              <FileText className="size-4" aria-hidden />
              {t("export.pdf")}
            </MenuItem>
            <MenuItem onSelect={printSheet}>
              <Printer className="size-4" aria-hidden />
              {t("export.print")}
            </MenuItem>
          </MenuContent>
        </Menu>
        <Tooltip label={fullscreen ? t("toolbar.exitFullscreen") : t("toolbar.fullscreen")}>
          <Button
            type="button"
            variant={fullscreen ? "primary" : "secondary"}
            size="icon"
            className="size-10"
            aria-label={fullscreen ? t("toolbar.exitFullscreen") : t("toolbar.fullscreen")}
            aria-pressed={fullscreen}
            data-testid="fullscreen"
            onClick={() => (fullscreen ? exitFullscreen() : void enterFullscreen())}
          >
            {fullscreen ? (
              <Minimize2 className="size-4" aria-hidden />
            ) : (
              <Maximize2 className="size-4" aria-hidden />
            )}
          </Button>
        </Tooltip>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="lg:hidden"
          aria-expanded={panel === "props"}
          onClick={() => setPanel(panel === "props" ? null : "props")}
          data-testid="open-properties"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {t("toolbar.properties")}
        </Button>
        {toolbarExtra}
      </div>

      {/* steps */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StepBar
          count={stepCount}
          current={shownStep}
          titles={d.stepTitles}
          disabled={locked}
          onSelect={goToStep}
          onAdd={() => {
            const next = commit([{ op: "add_step" }], {
              say: t("announce.stepAdded"),
              sound: "step",
            });
            if (next) {
              setStep(stepCountOf(next));
              setSelection(NO_SELECTION);
            }
          }}
          onDuplicate={(n) => {
            const next = commit([{ op: "duplicate_step", step: n }], {
              say: t("announce.stepAdded"),
              sound: "step",
            });
            if (next) setStep(n + 1);
          }}
          onRename={(n, value) =>
            commit([{ op: "set_step_title", step: n, title: value }], {
              say: t("announce.stepRenamed"),
              sound: null,
            })
          }
          onDelete={(n) => {
            const next = commit([{ op: "remove_step", step: n }], {
              say: t("announce.stepRemoved"),
              sound: "delete",
            });
            if (next) setStep(Math.min(n, stepCountOf(next)));
          }}
          onMove={(n, to) => {
            const next = commit([{ op: "move_step", step: n, to }], {
              say: t("announce.stepMoved"),
              sound: "step",
            });
            if (next) setStep(to);
          }}
        />
        <p className="text-sm text-ink-muted" data-testid="workspace-hint" id="workspace-hint">
          {hint}
        </p>
      </div>

      {pending?.kind === "path" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending.points.length === 0}
            onClick={finishPending}
            data-testid="finish-path"
          >
            {t("finishPath")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setPending(null);
              setUi(IDLE_UI);
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-ink"
          data-testid="workspace-error"
        >
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          "grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)_16rem]",
          fullscreen && "min-h-0 flex-1",
        )}
      >
        {/* tool library (a bottom sheet on small screens) */}
        <aside
          aria-label={t("library.label")}
          className={cn(
            panel === "tools"
              ? "fixed inset-x-0 bottom-0 z-40 max-h-[72vh] overflow-y-auto rounded-t-xl border border-line bg-surface-raised p-3 shadow-lift"
              : "hidden",
            "lg:static lg:z-auto lg:block lg:max-h-[42rem] lg:overflow-y-auto lg:rounded-lg lg:border lg:border-line lg:bg-surface-raised lg:p-3 lg:shadow-none",
          )}
        >
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <h3 className="eyebrow">{t("library.label")}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPanel(null)}>
              <X className="size-4" aria-hidden />
              {t("close")}
            </Button>
          </div>
          {libraryPanel}
        </aside>

        {/* the court */}
        <div className="flex min-w-0 flex-col gap-2">
          <div
            ref={stageRef}
            className={cn(
              "relative mx-auto w-full overflow-hidden rounded-lg border border-line bg-surface-raised",
              fullscreen ? "max-h-full" : "max-w-3xl",
            )}
            style={{ aspectRatio: `${vis.w} / ${vis.h}` }}
          >
            <DiagramView
              diagram={shown}
              pack={pack}
              title={t("court.title")}
              animated={!ui.dragDelta && !ui.transient && !playMode}
              step={playMode ? undefined : step}
              positions={positions}
              visibleActions={playFrame?.visibleActions}
              hideActions={false}
              viewBox={vb}
              className="block h-full w-full"
              svgProps={{
                ref: svgRef,
                onPointerDown,
                onPointerMove,
                onPointerUp,
                onPointerCancel,
                onDoubleClick,
                tabIndex: 0,
                "aria-describedby": "workspace-hint",
                "data-testid": "court-canvas",
                style: { touchAction: "none", cursor, userSelect: "none" },
              }}
              overlay={
                <CourtOverlay
                  scene={shownScene}
                  selection={selection}
                  dragDelta={ui.dragDelta}
                  preview={ui.preview}
                  guides={ui.guides}
                  drop={ui.drop}
                  unit={unit}
                  bounds={pack.bounds}
                  actionHandles={actionHandles}
                  hidden={playMode}
                />
              }
            />

            {/* a note being typed, right where it will go */}
            {textDraft ? (
              <form
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${((textDraft.at.x - vis.x) / vis.w) * 100}%`,
                  top: `${((textDraft.at.y - vis.y) / vis.h) * 100}%`,
                }}
                onSubmit={(e) => {
                  e.preventDefault();
                  commitText();
                }}
              >
                <Input
                  autoFocus
                  value={textDraft.value}
                  maxLength={40}
                  aria-label={t("textLabel")}
                  placeholder={t("textPlaceholder")}
                  data-testid="text-input"
                  className="h-9 w-44 text-sm shadow-lift"
                  onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setTextDraft(null);
                    }
                  }}
                  onBlur={commitText}
                />
              </form>
            ) : null}

            {/* the toolbar next to what is selected */}
            {toolbarStyle && !locked ? (
              <div
                className="absolute z-10 flex -translate-x-1/2 -translate-y-full gap-1 rounded-lg border border-line bg-surface-raised p-1 shadow-lift"
                style={toolbarStyle}
                role="toolbar"
                aria-label={t("context.label")}
                data-testid="context-toolbar"
              >
                <ContextButton label={t("duplicate")} onClick={doDuplicate} testId="ctx-duplicate">
                  <Layers className="size-4" aria-hidden />
                </ContextButton>
                {selectedEntity && selectedEntity.type !== "ball" ? (
                  <ContextButton
                    label={t("rotate")}
                    onClick={() => doRotate(90)}
                    testId="ctx-rotate"
                  >
                    <RotateCcw className="size-4 -scale-x-100" aria-hidden />
                  </ContextButton>
                ) : null}
                <ContextButton label={t("delete")} onClick={doDelete} testId="ctx-delete">
                  <X className="size-4" aria-hidden />
                </ContextButton>
              </div>
            ) : null}

            {empty && !playMode ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
                <p className="rounded-full border border-line bg-surface-raised/95 px-4 py-1.5 text-center text-sm text-ink-muted shadow-paper">
                  {t("court.empty")}
                </p>
              </div>
            ) : null}
          </div>

          {playMode ? (
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
              <input
                type="range"
                min={0}
                max={Math.max(0.01, timeline.duration)}
                step={0.01}
                value={Math.min(clock, timeline.duration)}
                aria-label={t("toolbar.progress")}
                onChange={(e) => {
                  setPlaying(false);
                  setClock(Number(e.target.value));
                }}
                className="h-9 flex-1 accent-[var(--accent)]"
                data-testid="play-progress"
              />
              <span className="w-16 text-right text-xs text-ink-muted tabular-nums">
                {Math.min(clock, timeline.duration).toFixed(1)}s
              </span>
            </div>
          ) : null}

          {/* what the drill needs, counted for the coach */}
          <div
            className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted"
            data-testid="inventory"
            aria-label={t("inventory.label")}
            role="group"
          >
            <span data-testid="inventory-players">
              {t("inventory.players", {
                count:
                  inventory.players.offense + inventory.players.defense + inventory.players.coaches,
              })}
            </span>
            {inventory.items.map((i) => (
              <span key={i.key} data-testid={`inventory-${i.key}`}>
                {t("inventory.item", {
                  count: i.count,
                  name: t(`inventory.names.${i.key}`, { count: i.count }),
                })}
              </span>
            ))}
          </div>
        </div>

        {/* properties (a bottom sheet on small screens) */}
        <aside
          aria-label={t("properties.label")}
          className={cn(
            panel === "props"
              ? "fixed inset-x-0 bottom-0 z-40 max-h-[72vh] overflow-y-auto rounded-t-xl border border-line bg-surface-raised p-3 shadow-lift"
              : "hidden",
            "lg:static lg:z-auto lg:block lg:max-h-[42rem] lg:overflow-y-auto lg:rounded-lg lg:border lg:border-line lg:bg-surface-raised lg:p-3 lg:shadow-none",
          )}
        >
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <h3 className="eyebrow">{t("properties.label")}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPanel(null)}>
              <X className="size-4" aria-hidden />
              {t("close")}
            </Button>
          </div>
          <PropertiesPanel
            d={d}
            scene={scene}
            selection={selection}
            step={step}
            disabled={locked}
            run={(ops, opts) => !!commit(ops, opts)}
            onSelect={(s) => setSelection(s)}
            nameOf={nameOf}
            anchors={anchorNames}
            onDuplicate={doDuplicate}
            onDelete={doDelete}
          />
        </aside>
      </div>

      {/* the object being carried from the library */}
      {paletteDrag ? (
        <div
          aria-hidden
          data-testid="drag-ghost"
          className="pointer-events-none fixed z-[70] grid size-14 -translate-x-1/2 -translate-y-1/2 scale-110 place-items-center rounded-xl border border-accent bg-surface-raised shadow-lift"
          style={{ left: paletteDrag.x, top: paletteDrag.y }}
        >
          <ToolGlyph tool={TOOL_BY_ID.get(paletteDrag.tool.id)!} size={34} />
        </div>
      ) : null}

      {/* the sheet the browser prints */}
      {printing && typeof document !== "undefined"
        ? createPortal(
            <PrintSheet
              d={d}
              pack={pack}
              steps={stepList}
              title={drillTitle}
              summary={summary()}
              caption={stepCaption}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

/** The apex of a curved segment (where its bend handle sits). */
function curveApex(a: Pt, b: Pt, curve: number): Pt {
  const len = dist(a, b) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const push = (curve * len * 0.5) / 2; // the curve's middle is halfway to its control point
  return { x: (a.x + b.x) / 2 - nx * push, y: (a.y + b.y) / 2 - ny * push };
}

function ContextButton({
  label,
  onClick,
  testId,
  children,
}: {
  label: string;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        data-testid={testId}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClick}
        className="grid size-9 place-items-center rounded-md text-ink smooth-colors hover:bg-surface-sunken"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** The print view: the title, the cast, and the court once per step — nothing of the editor. */
function PrintSheet({
  d,
  pack,
  steps,
  title,
  summary,
  caption,
}: {
  d: Diagram;
  pack: CourtPack;
  steps: readonly number[];
  title: string;
  summary: string;
  caption: (n: number) => string;
}) {
  return (
    <div className="diagram-print-root" data-testid="print-sheet">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mb-4 text-sm">{summary}</p>
      <div className={cn("grid gap-4", steps.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {steps.map((n) => (
          <figure key={n} className="break-inside-avoid">
            {steps.length > 1 ? (
              <figcaption className="mb-1 text-sm font-semibold">{caption(n)}</figcaption>
            ) : null}
            <DiagramView
              diagram={d}
              pack={pack}
              theme="print"
              step={steps.length > 1 ? n : undefined}
              className="block h-auto w-full"
            />
          </figure>
        ))}
      </div>
    </div>
  );
}

export { courtSvg };
