import { describe, expect, it } from "vitest";
import type { DiagramInput } from "@/engines/diagram";
import { FIBA_FULL_COURT, FIBA_HALF_COURT } from "@/sports/basketball/court-fiba";
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
} from "./editor-model";

const start: DiagramInput = {
  schemaVersion: 1,
  sport: "basketball",
  court: { type: "half", variant: "fiba" },
  entities: [
    { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "top_key" } },
    { id: "b1", type: "ball", heldBy: "o1" },
  ],
  actions: [],
  annotations: [],
};
const pack = FIBA_HALF_COURT;

describe("the editor's history", () => {
  it("opens a valid diagram and refuses one that is not", () => {
    expect(startHistory(start, pack)).not.toBeNull();
    expect(
      startHistory(
        {
          ...start,
          entities: [{ ...start.entities[0]!, at: { anchor: "nowhere" } }],
        } as DiagramInput,
        pack,
      ),
    ).toBeNull();
    expect(startHistory({ nonsense: true } as unknown as DiagramInput, pack)).toBeNull();
  });

  it("commits an edit, then undoes, redoes and resets it", () => {
    let h = startHistory(start, pack)!;
    expect(canUndo(h) || canRedo(h) || isChanged(h)).toBe(false);

    h = commit(h, [{ op: "add_player", side: "defense", at: { x: 0, y: 5 } }], pack).history;
    h = commit(h, [{ op: "move", id: "o1", to: { x: 2, y: 6 } }], pack).history;
    expect(h.present.entities).toHaveLength(3);
    expect(canUndo(h)).toBe(true);
    expect(isChanged(h)).toBe(true);

    h = undo(h);
    expect(h.present.entities.find((e) => e.id === "o1")).toMatchObject({
      at: { anchor: "top_key" },
    });
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.entities.find((e) => e.id === "o1")).toMatchObject({ at: { x: 2, y: 6 } });

    h = reset(h);
    expect(h.present).toEqual(h.initial);
    expect(isChanged(h)).toBe(false);
    h = undo(h); // reset itself can be undone
    expect(h.present.entities).toHaveLength(3);
  });

  it("clears redo after a new edit, and does nothing when there is nothing to undo or redo", () => {
    let h = startHistory(start, pack)!;
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
    expect(reset(h)).toBe(h);
    h = commit(h, [{ op: "add_cone", at: { x: 1, y: 1 } }], pack).history;
    h = undo(h);
    h = commit(h, [{ op: "add_cone", at: { x: 2, y: 2 } }], pack).history;
    expect(canRedo(h)).toBe(false);
  });

  it("leaves the diagram and the history alone when an edit is invalid", () => {
    const h = startHistory(start, pack)!;
    const { history, result } = commit(h, [{ op: "move", id: "o1", to: { x: 99, y: 99 } }], pack);
    expect(result.ok).toBe(false);
    expect(history).toBe(h);
  });

  it("does not record an edit that changes nothing", () => {
    const h = startHistory(start, pack)!;
    const { history } = commit(h, [{ op: "move", id: "o1", to: { anchor: "top_key" } }], pack);
    expect(canUndo(history)).toBe(false);
  });

  it("switches court through the pack lookup", () => {
    const h = startHistory(start, pack)!;
    const { history } = commit(h, [{ op: "set_court", court: "full" }], pack, (c) =>
      c.type === "full" ? FIBA_FULL_COURT : FIBA_HALF_COURT,
    );
    expect(history.present.court.type).toBe("full");
  });

  it("keeps a bounded history", () => {
    let h = startHistory(start, pack)!;
    for (let i = 0; i < 130; i++)
      h = commit(h, [{ op: "move", id: "o1", to: { x: (i % 20) / 10 + 0.1, y: 5 } }], pack).history;
    expect(h.past.length).toBeLessThanOrEqual(100);
  });
});

describe("snapping", () => {
  it("rounds to a tenth of a metre and keeps the point on the court", () => {
    expect(snap({ x: 1.234, y: 5.678 }, pack)).toEqual({ x: 1.2, y: 5.7 });
    expect(snap({ x: -99, y: 99 }, pack)).toEqual({ x: pack.bounds.minX, y: pack.bounds.maxY });
  });
});
