import * as React from "react";
import type { Diagram } from "@/engines/diagram";

/**
 * The undo history of one diagram: the present, what came before, what was undone. Every edit — an object added, moved,
 * turned, a line drawn, a property changed, a paste — replaces `present` by one new valid diagram, so one Undo takes back
 * exactly one thing the coach did. (The diagrams themselves are always valid: edits go through the shared operations, which
 * refuse anything that would break the drawing.)
 */
export interface HistoryState {
  past: Diagram[];
  present: Diagram;
  future: Diagram[];
}

export type HistoryAction =
  { type: "commit"; diagram: Diagram } | { type: "undo" } | { type: "redo" };

/** How many steps back a coach can go. A diagram is small, so this is generous. */
export const MAX_HISTORY = 200;

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "commit":
      return {
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: action.diagram,
        future: [],
      };
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
  }
}

export const canUndo = (h: HistoryState) => h.past.length > 0;
export const canRedo = (h: HistoryState) => h.future.length > 0;

export function useHistory(initial: Diagram) {
  const [state, dispatch] = React.useReducer(historyReducer, {
    past: [],
    present: initial,
    future: [],
  });
  return { state, dispatch };
}
