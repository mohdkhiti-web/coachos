import {
  applyOps,
  validateDiagram,
  type CourtPack,
  type Diagram,
  type DiagramInput,
  type DiagramOp,
  type OpsResult,
  diagramSchema,
} from "@/engines/diagram";

/**
 * The diagram editor's state: a history of valid diagrams. Every edit is a batch of the SAME operations the assistant may
 * propose (`applyOps`), so an edit either produces a valid diagram or changes nothing — the editor can never hold a broken
 * drawing. Pure and framework-free: the component only decides WHICH operations a click means.
 */

export interface History {
  /** The diagram as the editor was opened: what "Reset" returns to. */
  initial: Diagram;
  past: Diagram[];
  present: Diagram;
  future: Diagram[];
}

const MAX_HISTORY = 100;

/** Start editing. `null` = the diagram is not valid (it cannot be edited here; the caller says why). */
export function startHistory(diagram: DiagramInput, pack: CourtPack): History | null {
  const parsed = diagramSchema.safeParse(diagram);
  if (!parsed.success || validateDiagram(parsed.data, pack).length > 0) return null;
  return { initial: parsed.data, past: [], present: parsed.data, future: [] };
}

export type PackFor = (court: Diagram["court"]) => CourtPack | undefined;

/** Apply operations: on success a new present (the old one goes to the undo list, redo is cleared); on failure nothing changes. */
export function commit(
  h: History,
  ops: readonly DiagramOp[],
  pack: CourtPack,
  packFor?: PackFor,
): { history: History; result: OpsResult } {
  const result = applyOps(h.present, ops, pack, packFor);
  if (!result.ok) return { history: h, result };
  if (JSON.stringify(result.diagram) === JSON.stringify(h.present)) return { history: h, result };
  return {
    result,
    history: {
      ...h,
      past: [...h.past, h.present].slice(-MAX_HISTORY),
      present: result.diagram,
      future: [],
    },
  };
}

export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;
export const isChanged = (h: History) => JSON.stringify(h.present) !== JSON.stringify(h.initial);

export function undo(h: History): History {
  const previous = h.past[h.past.length - 1];
  if (!previous) return h;
  return { ...h, past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  const next = h.future[0];
  if (!next) return h;
  return { ...h, past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}

/** Back to how it was when opened. Reset is itself undoable. */
export function reset(h: History): History {
  if (!isChanged(h)) return h;
  return { ...h, past: [...h.past, h.present].slice(-MAX_HISTORY), present: h.initial, future: [] };
}

/** Metres, rounded to a tenth and kept on the court. */
export function snap(
  p: { x: number; y: number },
  pack: Pick<CourtPack, "bounds">,
): { x: number; y: number } {
  const { minX, maxX, minY, maxY } = pack.bounds;
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    x: Math.min(maxX, Math.max(minX, r(p.x))),
    y: Math.min(maxY, Math.max(minY, r(p.y))),
  };
}
