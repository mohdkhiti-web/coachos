import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiagramView } from "@/engines/diagram";
import { getCourtPack } from "@/sports/registry";
import { loadContent } from "./load";

/**
 * Production-readiness content check: every diagram in the seed content actually RENDERS — not just passes schema and
 * semantic validation (`content:check` / `load.ts` already do that). Catches anything validation could miss (a court pack
 * lookup gap, a NaN slipping into the SVG) before it reaches a coach's screen, PDF or PNG.
 */

const bb = loadContent().bySport["basketball"]!;

describe("every seed diagram renders", () => {
  it("produces well-formed, finite SVG for every drill's diagrams", () => {
    expect(bb.drills.length).toBeGreaterThan(0);
    let rendered = 0;
    for (const drill of bb.drills) {
      for (const g of drill.diagrams) {
        const pack = getCourtPack(g.diagram.sport, g.diagram.court);
        expect(pack, `${drill.title}: unknown court for its diagram`).toBeDefined();
        const markup = renderToStaticMarkup(
          <DiagramView diagram={g.diagram} pack={pack!} title={g.title || drill.title} />,
        );
        expect(markup, `${drill.title}: "${g.title}"`).toContain("<svg");
        expect(markup, `${drill.title}: "${g.title}" has a NaN in its geometry`).not.toMatch(/NaN/);
        expect(markup, `${drill.title}: "${g.title}" has an Infinity in its geometry`).not.toMatch(
          /Infinity/,
        );
        rendered++;
      }
    }
    expect(rendered).toBeGreaterThanOrEqual(bb.drills.length); // every drill has at least one diagram (also checked in content.test.ts)
  });
});
