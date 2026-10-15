import type { DiagramInput } from "@/engines/diagram";

/**
 * Starting layouts for the drill diagram workspace: where the players, cones and equipment usually stand for a shooting
 * drill, a 3v2, a closeout… and the first movements. They are DIAGRAMS only — positions and lines a coach then edits — not
 * drill content: no title, no instructions, no coaching points. Content comes from the library.
 *
 * Every template is checked by a test (schema + court rules) so none can ever open a broken drawing. The keys are the ids of
 * `diagramWorkspace.templates` in the messages.
 */

const half = { type: "half", variant: "fiba" } as const;
const full = { type: "full", variant: "fiba" } as const;

const base = (
  court: DiagramInput["court"],
  entities: DiagramInput["entities"],
  actions: NonNullable<DiagramInput["actions"]>,
  extra: Partial<DiagramInput> = {},
): DiagramInput => ({
  schemaVersion: 1,
  sport: "basketball",
  court,
  entities,
  actions,
  annotations: [],
  ...extra,
});

const player = (
  id: string,
  side: "offense" | "defense",
  label: string,
  at: { anchor: string; offset?: [number, number] } | { x: number; y: number },
) => ({ id, type: "player" as const, side, label, at });

const cone = (id: string, x: number, y: number) => ({ id, type: "cone" as const, at: { x, y } });

export interface DiagramTemplate {
  /** The key of its name in `diagramWorkspace.templates`. */
  key: string;
  diagram: DiagramInput;
}

export const BASKETBALL_DIAGRAM_TEMPLATES: readonly DiagramTemplate[] = [
  {
    key: "shooting",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { anchor: "top_key" }),
        player("o2", "offense", "2", { anchor: "left_wing" }),
        player("o3", "offense", "3", { anchor: "right_wing" }),
        { id: "b1", type: "ball", heldBy: "o1" },
        { id: "b2", type: "ball", heldBy: "o2" },
        { id: "b3", type: "ball", heldBy: "o3" },
      ],
      [
        { id: "a1", step: 1, type: "shot", entity: "o1" },
        { id: "a2", step: 1, type: "shot", entity: "o2" },
        { id: "a3", step: 1, type: "shot", entity: "o3" },
      ],
    ),
  },
  {
    key: "passing",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { anchor: "top_key" }),
        player("o2", "offense", "2", { anchor: "left_wing" }),
        player("o3", "offense", "3", { anchor: "right_wing" }),
        { id: "b1", type: "ball", heldBy: "o1" },
      ],
      [
        { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
        { id: "a2", step: 2, type: "pass", from: "o2", to: "o3" },
        { id: "a3", step: 3, type: "pass", from: "o3", to: "o1" },
      ],
    ),
  },
  {
    key: "ballHandling",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { x: -5, y: 10 }),
        { id: "b1", type: "ball", heldBy: "o1" },
        cone("k1", -2.5, 9),
        cone("k2", 0, 7),
        cone("k3", 2.5, 9),
        cone("k4", 5, 7),
      ],
      [
        {
          id: "a1",
          step: 1,
          type: "dribble",
          entity: "o1",
          path: [
            { x: -2.5, y: 8 },
            { x: 0, y: 8.2 },
            { x: 2.5, y: 8 },
            { x: 5, y: 8.2 },
          ],
        },
      ],
    ),
  },
  {
    key: "finishing",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { anchor: "top_key" }),
        { id: "b1", type: "ball", heldBy: "o1" },
        { id: "c1", type: "coach", at: { anchor: "right_wing" } },
      ],
      [
        {
          id: "a1",
          step: 1,
          type: "dribble",
          entity: "o1",
          path: [
            { x: -2.5, y: 4 },
            { x: -1.6, y: 1.4 },
          ],
        },
        { id: "a2", step: 2, type: "shot", entity: "o1" },
      ],
    ),
  },
  {
    key: "oneOnOne",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { anchor: "top_key" }),
        player("x1", "defense", "X1", { anchor: "top_key", offset: [0, -1.4] }),
        { id: "b1", type: "ball", heldBy: "o1" },
      ],
      [
        {
          id: "a1",
          step: 1,
          type: "dribble",
          entity: "o1",
          path: [{ x: -3, y: 4.5 }],
        },
        {
          id: "a2",
          step: 1,
          type: "defend",
          kind: "slide",
          entity: "x1",
          path: [{ x: -2.4, y: 3.2 }],
        },
      ],
    ),
  },
  {
    key: "twoOnOne",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { anchor: "top_key" }),
        player("o2", "offense", "2", { anchor: "right_wing" }),
        player("x1", "defense", "X1", { x: 0.8, y: 4.6 }),
        { id: "b1", type: "ball", heldBy: "o1" },
      ],
      [
        { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
        { id: "a2", step: 1, type: "cut", entity: "o1", path: [{ x: -1.2, y: 1.6 }] },
        { id: "a3", step: 2, type: "shot", entity: "o2" },
      ],
    ),
  },
  {
    key: "threeOnTwo",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { anchor: "top_key" }),
        player("o2", "offense", "2", { anchor: "left_wing" }),
        player("o3", "offense", "3", { anchor: "right_wing" }),
        player("x1", "defense", "X1", { x: -1.4, y: 4.2 }),
        player("x2", "defense", "X2", { x: 1.4, y: 4.2 }),
        { id: "b1", type: "ball", heldBy: "o1" },
      ],
      [
        { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
        { id: "a2", step: 2, type: "pass", from: "o2", to: "o3" },
        { id: "a3", step: 3, type: "shot", entity: "o3" },
      ],
    ),
  },
  {
    key: "threeOnThree",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { anchor: "top_key" }),
        player("o2", "offense", "2", { anchor: "left_wing" }),
        player("o3", "offense", "3", { anchor: "right_wing" }),
        player("x1", "defense", "X1", { anchor: "top_key", offset: [0, -1.4] }),
        player("x2", "defense", "X2", { anchor: "left_wing", offset: [0.6, -1.3] }),
        player("x3", "defense", "X3", { anchor: "right_wing", offset: [-0.6, -1.3] }),
        { id: "b1", type: "ball", heldBy: "o1" },
      ],
      [
        { id: "a1", step: 1, type: "screen", entity: "o2", target: { entity: "x1" }, kind: "ball" },
        { id: "a2", step: 1, type: "dribble", entity: "o1", path: [{ x: -1.6, y: 5.2 }] },
        { id: "a3", step: 2, type: "pass", from: "o1", to: "o3" },
      ],
    ),
  },
  {
    key: "closeout",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { anchor: "left_wing" }),
        player("x1", "defense", "X1", { x: -2.2, y: 2.6 }),
        { id: "c1", type: "coach", at: { anchor: "top_key" } },
        { id: "b1", type: "ball", heldBy: "c1" },
      ],
      [
        { id: "a1", step: 1, type: "pass", from: "c1", to: "o1" },
        {
          id: "a2",
          step: 1,
          type: "defend",
          kind: "closeout",
          entity: "x1",
          path: [{ x: -4.4, y: 4.2 }],
        },
      ],
    ),
  },
  {
    key: "shell",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { anchor: "top_key" }),
        player("o2", "offense", "2", { anchor: "left_wing" }),
        player("o3", "offense", "3", { anchor: "right_wing" }),
        player("o4", "offense", "4", { anchor: "left_corner" }),
        player("x1", "defense", "X1", { anchor: "top_key", offset: [0, -1.4] }),
        player("x2", "defense", "X2", { anchor: "left_wing", offset: [0.6, -1.3] }),
        player("x3", "defense", "X3", { anchor: "right_wing", offset: [-0.6, -1.3] }),
        player("x4", "defense", "X4", { anchor: "left_corner", offset: [0.8, -1.2] }),
        { id: "b1", type: "ball", heldBy: "o1" },
      ],
      [
        { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
        {
          id: "a2",
          step: 1,
          type: "defend",
          kind: "closeout",
          entity: "x2",
          path: [{ x: -4.5, y: 4.4 }],
        },
        { id: "a3", step: 2, type: "pass", from: "o2", to: "o4" },
        {
          id: "a4",
          step: 2,
          type: "defend",
          kind: "help",
          entity: "x3",
          path: [{ x: 1.4, y: 3.4 }],
        },
      ],
    ),
  },
  {
    key: "transition",
    diagram: base(
      full,
      [
        player("o1", "offense", "1", { x: 0, y: 16 }),
        player("o2", "offense", "2", { x: -5.5, y: 14.5 }),
        player("o3", "offense", "3", { x: 5.5, y: 14.5 }),
        player("x1", "defense", "X1", { x: 0, y: 21 }),
        { id: "b1", type: "ball", heldBy: "o1" },
      ],
      [
        { id: "a1", step: 1, type: "dribble", entity: "o1", path: [{ x: 0, y: 19.5 }] },
        { id: "a2", step: 1, type: "sprint", entity: "o2", path: [{ x: -4.5, y: 20.5 }] },
        { id: "a3", step: 1, type: "sprint", entity: "o3", path: [{ x: 4.5, y: 20.5 }] },
        { id: "a4", step: 2, type: "pass", from: "o1", to: "o2" },
        {
          id: "a5",
          step: 3,
          type: "shot",
          entity: "o2",
          to: { anchor: "far_basket" },
        },
      ],
    ),
  },
  {
    key: "fastBreak",
    diagram: base(
      full,
      [
        player("o1", "offense", "1", { x: 0, y: 10 }),
        player("o2", "offense", "2", { x: -6, y: 9 }),
        player("o3", "offense", "3", { x: 6, y: 9 }),
        { id: "b1", type: "ball", heldBy: "o1" },
      ],
      [
        { id: "a1", step: 1, type: "dribble", entity: "o1", path: [{ x: 0, y: 17 }] },
        { id: "a2", step: 1, type: "sprint", entity: "o2", path: [{ x: -5, y: 19 }] },
        { id: "a3", step: 1, type: "sprint", entity: "o3", path: [{ x: 5, y: 19 }] },
        { id: "a4", step: 2, type: "pass", from: "o1", to: "o3" },
        { id: "a5", step: 3, type: "shot", entity: "o3", to: { anchor: "far_basket" } },
      ],
    ),
  },
  {
    key: "warmUp",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { x: -6, y: 11 }),
        player("o2", "offense", "2", { x: -3, y: 11 }),
        player("o3", "offense", "3", { x: 3, y: 11 }),
        player("o4", "offense", "4", { x: 6, y: 11 }),
        cone("k1", -6, 4),
        cone("k2", -3, 4),
        cone("k3", 3, 4),
        cone("k4", 6, 4),
      ],
      [
        { id: "a1", step: 1, type: "sprint", entity: "o1", path: [{ x: -6, y: 5 }] },
        { id: "a2", step: 1, type: "sprint", entity: "o2", path: [{ x: -3, y: 5 }] },
        { id: "a3", step: 1, type: "sprint", entity: "o3", path: [{ x: 3, y: 5 }] },
        { id: "a4", step: 1, type: "sprint", entity: "o4", path: [{ x: 6, y: 5 }] },
      ],
    ),
  },
  {
    key: "cones",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { x: -5, y: 11 }),
        cone("k1", -5, 7),
        cone("k2", -1.5, 7),
        cone("k3", 2, 7),
        cone("k4", 5, 7),
        cone("k5", -1.5, 3.5),
        cone("k6", 2, 3.5),
      ],
      [
        {
          id: "a1",
          step: 1,
          type: "move",
          entity: "o1",
          path: [
            { x: -5, y: 8 },
            { x: -1.5, y: 8.4 },
            { x: 2, y: 5.4 },
            { x: 5, y: 5.6 },
          ],
        },
      ],
    ),
  },
  {
    key: "ladder",
    diagram: base(
      half,
      [
        player("o1", "offense", "1", { x: 0, y: 11.2 }),
        {
          id: "e1",
          type: "equipment",
          kind: "ladder",
          at: { x: 0, y: 6.2 },
          rotation: 90,
        },
        cone("k1", 0, 2.6),
      ],
      [
        {
          id: "a1",
          step: 1,
          type: "move",
          entity: "o1",
          path: [
            { x: 0, y: 8.6 },
            { x: 0, y: 3.4 },
          ],
        },
      ],
    ),
  },
];
