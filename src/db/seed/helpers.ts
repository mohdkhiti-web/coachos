import type { DiagramInput } from "../../engines/diagram/schema";
import type { DrillContentInput } from "../../modules/drills/content";
import type { EquipmentRule, Level } from "../enums";

/** Authoring helpers for seed diagrams: short, typed builders over the diagram schema. */

type Pos =
  | { anchor: string; offset?: [number, number] }
  | { x: number; y: number }
  | { entity: string; offset?: [number, number] };
type Entity = NonNullable<DiagramInput["entities"]>[number];
type Action = NonNullable<DiagramInput["actions"]>[number];
type Annotation = NonNullable<DiagramInput["annotations"]>[number];

export const at = (anchor: string, offset?: [number, number]): Pos =>
  offset ? { anchor, offset } : { anchor };
export const xy = (x: number, y: number): Pos => ({ x, y });
export const near = (entity: string, offset?: [number, number]): Pos =>
  offset ? { entity, offset } : { entity };

export const offense = (id: string, label: string, pos: Pos): Entity => ({
  id,
  type: "player",
  side: "offense",
  label,
  at: pos,
});
export const defense = (id: string, label: string, pos: Pos): Entity => ({
  id,
  type: "player",
  side: "defense",
  label,
  at: pos,
});
export const coach = (id: string, pos: Pos, label?: string): Entity => ({
  id,
  type: "coach",
  ...(label ? { label } : {}),
  at: pos,
});
export const cone = (id: string, pos: Pos): Entity => ({ id, type: "cone", at: pos });
export const spot = (id: string, pos: Pos, label?: string): Entity => ({
  id,
  type: "marker",
  kind: "spot",
  ...(label ? { label } : {}),
  at: pos,
});
export const ball = (id: string, heldBy: string): Entity => ({ id, type: "ball", heldBy });

export const pass = (id: string, step: number, from: string, to: string): Action => ({
  id,
  step,
  type: "pass",
  from,
  to,
});
export const cut = (id: string, step: number, entity: string, ...path: Pos[]): Action => ({
  id,
  step,
  type: "cut",
  entity,
  path,
});
export const move = (id: string, step: number, entity: string, ...path: Pos[]): Action => ({
  id,
  step,
  type: "move",
  entity,
  path,
});
export const dribble = (id: string, step: number, entity: string, ...path: Pos[]): Action => ({
  id,
  step,
  type: "dribble",
  entity,
  path,
});
export const screen = (id: string, step: number, entity: string, target: Pos): Action => ({
  id,
  step,
  type: "screen",
  entity,
  target,
});
export const shot = (id: string, step: number, entity: string, to?: Pos): Action => ({
  id,
  step,
  type: "shot",
  entity,
  ...(to ? { to } : {}),
});

export const note = (position: Pos, text: string): Annotation => ({
  type: "text",
  at: position,
  text,
});
export const zone = (from: Pos, to: Pos, label?: string): Annotation => ({
  type: "zone_rect",
  from,
  to,
  ...(label ? { label } : {}),
});

export const halfCourt = (
  entities: Entity[],
  actions: Action[] = [],
  annotations: Annotation[] = [],
): DiagramInput => ({
  schemaVersion: 1,
  sport: "basketball",
  court: { type: "half", variant: "fiba" },
  entities,
  actions,
  annotations,
});

export const fullCourt = (
  entities: Entity[],
  actions: Action[] = [],
  annotations: Annotation[] = [],
): DiagramInput => ({
  ...halfCourt(entities, actions, annotations),
  court: { type: "full", variant: "fiba" },
});

/** Everything the seed needs to know about one library drill. Validated by Zod + the diagram validators at seed time. */
export interface SeedDrill {
  seedKey: string;
  title: string;
  description: string;
  category: string;
  primarySkill: string;
  secondarySkills?: string[];
  level: Level;
  ageMin: number;
  ageMax: number;
  playersMin: number;
  playersMax: number;
  durationMin: number;
  durationMax: number;
  space: "half_court" | "full_court" | "partial_court" | "any_space";
  tags: string[];
  equipment: Array<{ type: string; rule: EquipmentRule; quantity: number }>;
  content: DrillContentInput;
  diagrams: Array<{ title: string; diagram: DiagramInput }>;
}
