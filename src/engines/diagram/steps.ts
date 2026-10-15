import type { Diagram } from "./schema";

/**
 * Who holds each ball at the START of a step. A ball is held from the diagram's start; a pass in step s hands it to the
 * receiver at the END of step s (exactly the rule `validateDiagram` enforces), so step s + 1 begins with the receiver holding it.
 * `step` 1 gives the starting possession; a step past the last gives the possession after everything. Ball → holder id.
 */
export function holdersAtStep(
  d: Pick<Diagram, "entities" | "actions">,
  step: number,
): Map<string, string> {
  const holder = new Map<string, string>();
  for (const e of d.entities) if (e.type === "ball" && e.heldBy) holder.set(e.id, e.heldBy);
  const steps = [...new Set(d.actions.map((a) => a.step))].sort((a, b) => a - b);
  for (const s of steps) {
    if (s >= step) break;
    const handed: Array<[string, string]> = [];
    for (const a of d.actions) {
      if (a.step !== s || a.type !== "pass") continue;
      for (const [ball, by] of holder) if (by === a.from) handed.push([ball, a.to]);
    }
    for (const [ball, to] of handed) holder.set(ball, to);
  }
  return holder;
}
