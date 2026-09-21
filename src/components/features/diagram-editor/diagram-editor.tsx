"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRightLeft,
  Copy,
  Eraser,
  Hand,
  Redo2,
  RotateCcw,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  DiagramView,
  PLAYER_RADIUS,
  applyOps,
  resolveDiagram,
  validateDiagram,
  type CourtPack,
  type Diagram,
  type DiagramInput,
  type DiagramOp,
} from "@/engines/diagram";
import { getCourtPack } from "@/sports/registry";
import {
  canRedo,
  canUndo,
  commit,
  isChanged,
  redo,
  reset,
  snap,
  startHistory,
  undo,
  type History,
} from "./editor-model";

/**
 * The diagram editor (Step 8): draw and change a drill diagram by clicking and dragging — add players, defenders, coaches,
 * cones and balls, move them, change roles and labels, draw passes, dribbles, cuts, screens and shots, undo, redo, reset,
 * save. Every change is one of the shared diagram OPERATIONS, so the editor can never hold an invalid drawing, and everything
 * it does can be done from the keyboard (the list of items and the arrow keys stand in for the mouse).
 */

type Tool =
  | "select"
  | "offense"
  | "defense"
  | "coach"
  | "cone"
  | "ball"
  | "pass"
  | "dribble"
  | "cut"
  | "move"
  | "screen"
  | "shot"
  | "text";

const ADD_TOOLS: Tool[] = ["offense", "defense", "coach", "cone", "ball"];
const ACTION_TOOLS: Tool[] = ["pass", "dribble", "cut", "move", "screen", "shot"];
const PATH_TOOLS = new Set<Tool>(["dribble", "cut", "move"]);
const MAX_PATH = 6;

type Pending = { tool: Tool; entity: string; path: Array<{ x: number; y: number }> } | null;
type Selection = { kind: "entity"; id: string } | { kind: "action"; id: string } | null;

export function DiagramEditor({
  diagram,
  onSave,
  onCancel,
  saving = false,
  disabled = false,
}: {
  diagram: DiagramInput;
  onSave: (diagram: Diagram) => void;
  onCancel?: () => void;
  saving?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("diagramEditor");
  const tv = useTranslations("diagram.issues");
  const sport = diagram.sport;
  const packFor = React.useCallback(
    (court: Diagram["court"]): CourtPack | undefined => getCourtPack(sport, court),
    [sport],
  );
  const [history, setHistory] = React.useState<History | null>(() => {
    const pack = getCourtPack(sport, diagram.court);
    return pack ? startHistory(diagram, pack) : null;
  });
  const [tool, setTool] = React.useState<Tool>("select");
  const [selection, setSelection] = React.useState<Selection>(null);
  const [pending, setPending] = React.useState<Pending>(null);
  const [drag, setDrag] = React.useState<{ id: string; at: { x: number; y: number } } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [noteText, setNoteText] = React.useState("");
  const svgRef = React.useRef<SVGSVGElement>(null);

  const present = history?.present;
  const pack = present ? packFor(present.court) : undefined;

  const view = React.useMemo(() => {
    if (!present || !pack) return null;
    const { resolved } = resolveDiagram(present, pack);
    const m = pack.margin;
    const b = pack.bounds;
    return {
      resolved,
      box: `${b.minX - m} ${b.minY - m} ${b.maxX - b.minX + 2 * m} ${b.maxY - b.minY + 2 * m}`,
    };
  }, [present, pack]);

  if (!history || !present || !pack || !view) {
    return (
      <p
        role="alert"
        className="rounded-md border border-danger bg-danger-soft p-4 text-sm text-ink"
      >
        {t("cannotEdit")}
      </p>
    );
  }

  const nameOf = (id: string): string => {
    const e = present.entities.find((x) => x.id === id);
    if (!e) return id;
    if ((e.type === "player" || e.type === "coach" || e.type === "marker") && e.label)
      return e.label;
    return t(`kinds.${e.type}`);
  };

  /** Run operations; say why in words when they are refused. */
  function run(ops: DiagramOp[], say?: string): boolean {
    if (!history || !pack) return false;
    const { history: next, result } = commit(history, ops, pack, packFor);
    if (!result.ok) {
      const first = result.issues[0];
      setError(
        first
          ? tv.has(first.code)
            ? tv(first.code, first.params ?? {})
            : t("refused")
          : t("refused"),
      );
      return false;
    }
    setError(null);
    setHistory(next);
    if (say) setAnnounce(say);
    return true;
  }

  const point = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return snap({ x: p.x, y: p.y }, pack!);
  };

  const carrier = (id: string) => {
    const e = present.entities.find((x) => x.id === id);
    return e?.type === "player" || e?.type === "coach";
  };

  function finishPath() {
    if (!pending || pending.path.length === 0) {
      setPending(null);
      return;
    }
    const ok = run(
      [
        {
          op: "add_action",
          action: { type: pending.tool as "cut", entity: pending.entity, path: pending.path },
        },
      ],
      t("announce.added", { what: t(`tools.${pending.tool}`) }),
    );
    if (ok) setPending(null);
  }

  function chooseTool(next: Tool) {
    setTool(next);
    setPending(null);
    setError(null);
    if (next !== "select") setSelection(null);
  }

  function onCanvasClick(e: React.MouseEvent) {
    if (disabled) return;
    const at = point(e);
    if (!at) return;
    if (tool === "select") {
      setSelection(null);
      return;
    }
    if (tool === "offense" || tool === "defense") {
      run(
        [{ op: "add_player", side: tool, at }],
        t("announce.added", { what: t(`tools.${tool}`) }),
      );
    } else if (tool === "coach")
      run([{ op: "add_coach", at }], t("announce.added", { what: t("tools.coach") }));
    else if (tool === "cone")
      run([{ op: "add_cone", at }], t("announce.added", { what: t("tools.cone") }));
    else if (tool === "ball")
      run([{ op: "add_ball", at }], t("announce.added", { what: t("tools.ball") }));
    else if (tool === "text") {
      if (!noteText.trim()) return setError(t("textNeeded"));
      run(
        [{ op: "add_text", at, text: noteText.trim() }],
        t("announce.added", { what: t("tools.text") }),
      );
    } else if (pending && PATH_TOOLS.has(pending.tool)) {
      if (pending.path.length >= MAX_PATH) return setError(t("pathFull", { max: MAX_PATH }));
      setPending({ ...pending, path: [...pending.path, at] });
    }
  }

  function onEntityActivate(id: string) {
    if (disabled) return;
    const e = present!.entities.find((x) => x.id === id)!;
    if (tool === "select") {
      setSelection({ kind: "entity", id });
      return;
    }
    if (tool === "ball") {
      if (!carrier(id)) return setError(t("needCarrier"));
      const existing = present!.entities.find((x) => x.type === "ball");
      run(
        existing
          ? [{ op: "give_ball", ball: existing.id, to: id }]
          : [{ op: "add_ball", heldBy: id }],
        t("announce.ball", { who: nameOf(id) }),
      );
      return;
    }
    if (ACTION_TOOLS.includes(tool)) {
      if (!carrier(id)) return setError(t("needCarrier"));
      if (tool === "shot") {
        run(
          [{ op: "add_action", action: { type: "shot", entity: id } }],
          t("announce.added", { what: t("tools.shot") }),
        );
      } else if (tool === "pass" || tool === "screen") {
        if (!pending) return setPending({ tool, entity: id, path: [] });
        if (pending.entity === id) return setPending(null);
        const ok =
          tool === "pass"
            ? run(
                [{ op: "add_action", action: { type: "pass", from: pending.entity, to: id } }],
                t("announce.added", { what: t("tools.pass") }),
              )
            : run(
                [
                  {
                    op: "add_action",
                    action: { type: "screen", entity: pending.entity, target: { entity: id } },
                  },
                ],
                t("announce.added", { what: t("tools.screen") }),
              );
        if (ok) setPending(null);
      } else if (PATH_TOOLS.has(tool)) {
        if (!pending) return setPending({ tool, entity: id, path: [] });
        if (pending.path.length >= MAX_PATH) return setError(t("pathFull", { max: MAX_PATH }));
        const where = view!.resolved.entities.find((r) => r.entity.id === id)?.at;
        if (where) setPending({ ...pending, path: [...pending.path, snap(where, pack!)] });
      }
      return;
    }
    if (e.type === "ball") return;
    setSelection({ kind: "entity", id });
  }

  const selected =
    selection?.kind === "entity" ? present.entities.find((e) => e.id === selection.id) : undefined;
  const selectedAction =
    selection?.kind === "action" ? present.actions.find((a) => a.id === selection.id) : undefined;

  function nudge(id: string, dx: number, dy: number) {
    const where = view!.resolved.entities.find((r) => r.entity.id === id)?.at;
    if (!where) return;
    run(
      [{ op: "move", id, to: snap({ x: where.x + dx, y: where.y + dy }, pack!) }],
      t("announce.moved", { who: nameOf(id) }),
    );
  }

  function onEntityKey(e: React.KeyboardEvent, id: string) {
    if (disabled) return;
    const step = e.shiftKey ? 1 : 0.25;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEntityActivate(id);
    } else if (move[e.key] && tool === "select") {
      e.preventDefault();
      setSelection({ kind: "entity", id });
      nudge(id, ...move[e.key]!);
    } else if ((e.key === "Delete" || e.key === "Backspace") && tool === "select") {
      e.preventDefault();
      removeSelected(id);
    }
  }

  function removeSelected(id: string) {
    if (run([{ op: "remove", id }], t("announce.removed", { who: nameOf(id) }))) setSelection(null);
  }

  // ---- dragging (select tool) ----
  function onPointerDown(e: React.PointerEvent, id: string) {
    if (disabled || tool !== "select") return;
    const ent = present!.entities.find((x) => x.id === id);
    if (ent?.type === "ball" && ent.heldBy) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const at = point(e);
    if (at) setDrag({ id, at });
    setSelection({ kind: "entity", id });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const at = point(e);
    if (at) setDrag({ ...drag, at });
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    const at = point(e) ?? drag.at;
    const moved = view!.resolved.entities.find((r) => r.entity.id === drag.id)?.at;
    setDrag(null);
    if (moved && Math.hypot(moved.x - at.x, moved.y - at.y) < 0.15) return; // a click, not a drag
    run([{ op: "move", id: drag.id, to: at }], t("announce.moved", { who: nameOf(drag.id) }));
  }

  // what is drawn while dragging: the diagram as it WOULD be (the real one changes only when the drag ends)
  const shown: Diagram = (() => {
    if (!drag) return present;
    const r = applyOps(present, [{ op: "move", id: drag.id, to: drag.at }], pack, packFor);
    return r.ok ? r.diagram : present;
  })();
  const shownResolved = drag ? resolveDiagram(shown, pack).resolved : view.resolved;
  const issues = validateDiagram(present, pack);

  const toolButton = (k: Tool, icon?: React.ReactNode) => (
    <Button
      key={k}
      type="button"
      size="sm"
      variant={tool === k ? "primary" : "secondary"}
      aria-pressed={tool === k}
      disabled={disabled}
      onClick={() => chooseTool(k)}
    >
      {icon}
      {t(`tools.${k}`)}
    </Button>
  );

  return (
    <div className="space-y-4" data-testid="diagram-editor">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t("toolbar")}>
        {toolButton("select", <Hand className="size-4" aria-hidden />)}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        {ADD_TOOLS.map((k) => toolButton(k))}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        {ACTION_TOOLS.map((k) => toolButton(k))}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        {toolButton("text", <Type className="size-4" aria-hidden />)}
      </div>

      <p className="text-sm text-ink-muted" data-testid="editor-hint">
        {pending
          ? PATH_TOOLS.has(pending.tool)
            ? t("hint.path", { count: pending.path.length })
            : t("hint.second")
          : t(`hint.${tool}`)}
      </p>
      {tool === "text" ? (
        <Field label={t("textLabel")} className="max-w-sm">
          {(c) => (
            <Input
              {...c}
              value={noteText}
              maxLength={40}
              onChange={(e) => setNoteText(e.target.value)}
            />
          )}
        </Field>
      ) : null}
      {pending && PATH_TOOLS.has(pending.tool) ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending.path.length === 0} onClick={finishPath}>
            {t("finishPath")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>
            {t("cancelPath")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface-raised">
          <DiagramView
            diagram={shown}
            pack={pack}
            title={t("canvasTitle")}
            className="block h-auto w-full"
          />
          <svg
            ref={svgRef}
            viewBox={view.box}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full touch-none"
            data-testid="editor-canvas"
            onClick={onCanvasClick}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{ cursor: tool === "select" ? "default" : "crosshair" }}
          >
            <rect x="-100" y="-100" width="300" height="300" fill="transparent" />
            {pending
              ? (() => {
                  const from = shownResolved.entities.find(
                    (r) => r.entity.id === pending.entity,
                  )?.at;
                  if (!from) return null;
                  const pts = [from, ...pending.path];
                  return (
                    <polyline
                      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="currentColor"
                      className="text-accent"
                      strokeWidth={0.14}
                      strokeDasharray="0.3 0.2"
                    />
                  );
                })()
              : null}
            {shownResolved.entities.map(({ entity: e, at }) => {
              if (e.type === "ball" && e.heldBy) return null;
              const isSel = selection?.kind === "entity" && selection.id === e.id;
              const isPend = pending?.entity === e.id;
              return (
                <g
                  key={e.id}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-label={t("entityLabel", { name: nameOf(e.id), kind: t(`kinds.${e.type}`) })}
                  aria-pressed={isSel}
                  data-entity={e.id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onEntityActivate(e.id);
                  }}
                  onKeyDown={(ev) => onEntityKey(ev, e.id)}
                  onPointerDown={(ev) => onPointerDown(ev, e.id)}
                  className="cursor-pointer outline-none focus-visible:[&>circle:first-child]:stroke-[0.12]"
                >
                  <circle
                    cx={at.x}
                    cy={at.y}
                    r={PLAYER_RADIUS + 0.45}
                    fill="transparent"
                    stroke={isSel || isPend ? "currentColor" : "none"}
                    className="text-accent"
                    strokeWidth={0.1}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        <div className="space-y-4">
          <section
            aria-labelledby="ed-selection"
            className="space-y-2 rounded-lg border border-line p-3"
          >
            <h4 id="ed-selection" className="eyebrow">
              {t("selection")}
            </h4>
            {selected ? (
              <div className="space-y-2">
                <p className="text-sm text-ink" data-testid="selected-name">
                  {nameOf(selected.id)} ·{" "}
                  {t(`kinds.${selected.type === "player" ? selected.side : selected.type}`)}
                </p>
                {selected.type === "player" || selected.type === "coach" ? (
                  <Field label={t("labelField")}>
                    {(c) => (
                      <Input
                        {...c}
                        key={selected.id}
                        defaultValue={selected.label ?? ""}
                        maxLength={3}
                        disabled={disabled}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== (selected.label ?? ""))
                            run([{ op: "set_label", id: selected.id, label: v }]);
                        }}
                        onKeyDown={(e) =>
                          e.key === "Enter" && (e.target as HTMLInputElement).blur()
                        }
                      />
                    )}
                  </Field>
                ) : null}
                {selected.type === "player" ? (
                  <Field label={t("role")}>
                    {(c) => (
                      <Select
                        {...c}
                        value={selected.side}
                        disabled={disabled}
                        onChange={(e) =>
                          run([
                            {
                              op: "set_side",
                              id: selected.id,
                              side: e.target.value as "offense" | "defense",
                            },
                          ])
                        }
                      >
                        <option value="offense">{t("kinds.offense")}</option>
                        <option value="defense">{t("kinds.defense")}</option>
                      </Select>
                    )}
                  </Field>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {selected.type !== "ball" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() =>
                        run([{ op: "duplicate", id: selected.id }], t("announce.duplicated"))
                      }
                    >
                      <Copy className="size-4" aria-hidden />
                      {t("duplicate")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => removeSelected(selected.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {t("remove")}
                  </Button>
                </div>
              </div>
            ) : selectedAction ? (
              <p className="text-sm text-ink">{t("actionSelected")}</p>
            ) : (
              <p className="text-sm text-ink-muted">{t("nothingSelected")}</p>
            )}
          </section>

          <section
            aria-labelledby="ed-court"
            className="space-y-2 rounded-lg border border-line p-3"
          >
            <h4 id="ed-court" className="eyebrow">
              {t("court")}
            </h4>
            <Select
              aria-label={t("court")}
              value={present.court.type}
              disabled={disabled}
              onChange={(e) => run([{ op: "set_court", court: e.target.value as "half" | "full" }])}
            >
              <option value="half">{t("courtHalf")}</option>
              <option value="full">{t("courtFull")}</option>
            </Select>
          </section>

          <section
            aria-labelledby="ed-actions"
            className="space-y-2 rounded-lg border border-line p-3"
          >
            <div className="flex items-center justify-between">
              <h4 id="ed-actions" className="eyebrow">
                {t("actionsHeading")}
              </h4>
              {present.actions.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => run([{ op: "clear_actions" }], t("announce.cleared"))}
                >
                  <Eraser className="size-4" aria-hidden />
                  {t("clearActions")}
                </Button>
              ) : null}
            </div>
            {present.actions.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noActions")}</p>
            ) : (
              <ol className="space-y-2">
                {present.actions.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 text-sm text-ink"
                    data-testid="action-row"
                  >
                    <ArrowRightLeft className="size-4 shrink-0 text-ink-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      {a.type === "pass"
                        ? t("actionText.pass", { from: nameOf(a.from), to: nameOf(a.to) })
                        : t(`actionText.${a.type}`, { who: nameOf(a.entity) })}
                    </span>
                    <label className="flex items-center gap-1 text-xs text-ink-muted">
                      {t("step")}
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={a.step}
                        disabled={disabled}
                        aria-label={t("stepOf", { id: a.id })}
                        className="h-8 w-12 rounded-md border border-line-strong bg-surface-raised px-1 text-center text-ink"
                        onChange={(e) => {
                          const step = Number(e.target.value);
                          if (Number.isInteger(step) && step >= 1 && step <= 12)
                            run([{ op: "set_step", id: a.id, step }]);
                        }}
                      />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      aria-label={t("removeAction", { text: a.type })}
                      onClick={() =>
                        run(
                          [{ op: "remove_action", id: a.id }],
                          t("announce.removed", { who: t(`tools.${a.type}`) }),
                        )
                      }
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-ink"
          data-testid="editor-error"
        >
          {error}
        </p>
      ) : null}
      {issues.length > 0 ? (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-ink"
        >
          {t("invalid")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || !canUndo(history)}
            onClick={() => {
              setHistory(undo(history));
              setAnnounce(t("announce.undone"));
            }}
          >
            <Undo2 className="size-4" aria-hidden />
            {t("undo")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || !canRedo(history)}
            onClick={() => {
              setHistory(redo(history));
              setAnnounce(t("announce.redone"));
            }}
          >
            <Redo2 className="size-4" aria-hidden />
            {t("redo")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || !isChanged(history)}
            onClick={() => {
              setHistory(reset(history));
              setSelection(null);
              setPending(null);
              setAnnounce(t("announce.reset"));
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            {t("reset")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("cancel")}
            </Button>
          ) : null}
          <Button
            type="button"
            loading={saving}
            disabled={disabled || issues.length > 0 || !isChanged(history)}
            onClick={() => onSave(history.present)}
          >
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
