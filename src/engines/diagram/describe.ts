import { anchorLabel } from "./pack";
import type { Action, Diagram, Entity, Position } from "./schema";

/**
 * Plain-language description of a diagram: used as SVG `<desc>` (screen readers), DOCX alt text later,
 * and as an LLM-readable summary. Deterministic. English for now (content, like drill text).
 */
export function describeDiagram(d: Diagram): string {
  const count = (pred: (e: Entity) => boolean) => d.entities.filter(pred).length;
  const offense = count((e) => e.type === "player" && e.side === "offense");
  const defense = count((e) => e.type === "player" && e.side === "defense");
  const coaches = count((e) => e.type === "coach");
  const balls = count((e) => e.type === "ball");
  const cones = count((e) => e.type === "cone");

  const byId = new Map(d.entities.map((e) => [e.id, e] as const));
  const name = (id: string): string => {
    const e = byId.get(id);
    if (!e) return id;
    if ((e.type === "player" || e.type === "coach" || e.type === "marker") && e.label) {
      return e.type === "coach"
        ? `coach ${e.label}`
        : e.type === "player" && e.side === "defense"
          ? `defender ${e.label}`
          : `player ${e.label}`;
    }
    if (e.type === "player") return e.side === "defense" ? "a defender" : "a player";
    return e.type === "coach" ? "the coach" : e.type;
  };
  const where = (p: Position): string => {
    if ("anchor" in p) return `the ${anchorLabel(p.anchor)}`;
    if ("entity" in p) return name(p.entity);
    return "the marked spot";
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const parts: string[] = [`${d.court.type === "full" ? "Full" : "Half"} court.`];
  const cast = [
    offense ? plural(offense, "offensive player", "offensive players") : "",
    defense ? plural(defense, "defender", "defenders") : "",
    coaches ? plural(coaches, "coach", "coaches") : "",
    balls ? plural(balls, "ball", "balls") : "",
    cones ? plural(cones, "cone", "cones") : "",
  ].filter(Boolean);
  if (cast.length) parts.push(`${cast.join(", ")}.`);

  const sentence = (a: Action): string => {
    switch (a.type) {
      case "pass":
        return `${name(a.from)} passes to ${name(a.to)}`;
      case "shot":
        return `${name(a.entity)} shoots${a.to ? ` at ${where(a.to)}` : ""}`;
      case "screen":
        return `${name(a.entity)} sets a screen on ${where(a.target)}`;
      case "cut":
      case "move":
      case "dribble": {
        const verb = a.type === "cut" ? "cuts" : a.type === "dribble" ? "dribbles" : "moves";
        const last = a.path[a.path.length - 1];
        return `${name(a.entity)} ${verb}${last ? ` to ${where(last)}` : ""}`;
      }
    }
  };

  const steps = [...new Set(d.actions.map((a) => a.step))].sort((x, y) => x - y);
  for (const s of steps) {
    const items = d.actions.filter((a) => a.step === s).map(sentence);
    const prefix = steps.length > 1 ? `Step ${s}: ` : "";
    parts.push(`${prefix}${items.join("; ")}.`);
  }
  return capitalize(parts.join(" "));
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
