import { describe, expect, it } from "vitest";
import { findDuplicates, jaccard, words } from "./duplicates";
import { loadContent } from "./load";

const drill = (seedKey: string, title: string, objective: string, instructions: string[]) => ({
  seedKey,
  title,
  category: "shooting",
  objective,
  instructions,
});

describe("duplicate detection", () => {
  it("flags identical titles, renamed copies and near-identical content", () => {
    const base = drill(
      "form-shooting",
      "Form Shooting",
      "Groove a one-hand release close to the rim.",
      [
        "Stand one metre from the rim facing the backboard square.",
        "Hold the ball on the fingertips of the shooting hand with the guide hand on the side.",
        "Extend the elbow and snap the wrist to finish with a high follow-through.",
        "Make five, step back one step and repeat from each spot.",
      ],
    );
    const renamed = { ...base, seedKey: "close-range-form-shots", title: "Close-Range Form Shots" };
    const sameTitle = {
      ...drill("form-shooting-2", "Form shooting drill", "Different.", ["Other."]),
    };
    const different = drill(
      "box-out-circle",
      "Box-Out Circle",
      "Hold position against a crashing rebounder.",
      [
        "Pair up around the circle with a ball in the middle.",
        "On the shot signal, make contact, pivot and seal the opponent.",
        "Hold the seal for three seconds before the coach releases the ball.",
        "Rotate partners and repeat.",
      ],
    );
    const pairs = findDuplicates([base, renamed, sameTitle, different]);
    expect(pairs).toContainEqual(
      expect.objectContaining({
        a: "form-shooting",
        b: "close-range-form-shots",
        reason: "same_content",
      }),
    );
    expect(pairs).toContainEqual(
      expect.objectContaining({ a: "form-shooting", b: "form-shooting-2", reason: "same_title" }),
    );
    expect(pairs.some((p) => p.a === "box-out-circle" || p.b === "box-out-circle")).toBe(false);
  });

  it("measures word overlap without stop words or plural noise", () => {
    expect(jaccard(words("the crossover dribbles"), words("crossover dribble"))).toBe(1);
    expect(jaccard(words("box out"), words("crossover"))).toBe(0);
  });

  it("finds no duplicate drills in the real library, per sport", () => {
    const content = loadContent();
    for (const sc of Object.values(content.bySport)) {
      const pairs = findDuplicates(
        sc.drills.map((d) => ({
          seedKey: d.seedKey,
          title: d.title,
          category: d.category,
          objective: d.content.objective,
          instructions: d.content.instructions,
        })),
      );
      expect(pairs, `${sc.sportKey} duplicates`).toEqual([]);
    }
  });
});
