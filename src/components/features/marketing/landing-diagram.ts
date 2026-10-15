import type { Diagram } from "@/engines/diagram";

/**
 * The drill diagram shown on the landing page: a real CoachOS diagram (the library's "Give-and-Go" drill — pass, cut,
 * return pass, shot), drawn by the same renderer the product uses. Kept as data here so the public page needs no
 * database access.
 */
export const LANDING_DIAGRAM: Diagram = {
  schemaVersion: 1,
  sport: "basketball",
  court: { type: "half", variant: "fiba" },
  entities: [
    { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "top_key" } },
    { id: "o2", type: "player", side: "offense", label: "2", at: { anchor: "left_wing" } },
    {
      id: "x1",
      type: "player",
      side: "defense",
      label: "X1",
      at: { entity: "o1", offset: [0.2, -1.1] },
    },
    {
      id: "x2",
      type: "player",
      side: "defense",
      label: "X2",
      at: { entity: "o2", offset: [0.6, -1] },
    },
    { id: "b1", type: "ball", heldBy: "o1" },
  ],
  actions: [
    { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
    { id: "a2", step: 1, type: "cut", entity: "o1", path: [{ x: -1.2, y: 3.6 }] },
    { id: "a3", step: 2, type: "pass", from: "o2", to: "o1" },
    { id: "a4", step: 3, type: "shot", entity: "o1" },
  ],
  annotations: [],
} as Diagram;
