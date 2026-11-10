import { describe, expect, it } from "vitest";
import { findDuplicates, jaccard, REVIEWED_DISTINCT, words } from "./duplicates";
import { loadContent } from "./load";

const drill = (seedKey: string, title: string, objective: string, instructions: string[]) => ({
  seedKey,
  title,
  category: "shooting",
  format: "1v1",
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

  it("flags the same purpose under a new name and differently worded instructions", () => {
    const a = drill(
      "transition-pull-up-vs-layup-decision",
      "Transition Pull-Up vs Layup Decision",
      "Choose between a pull-up jumper and a drive to the rim based on where the retreating defender sets up.",
      ["The ball handler attacks at full speed.", "Pull up if the defender protects the rim."],
    );
    const b = drill(
      "transition-pull-up-or-rim-read",
      "Transition Pull-Up or Rim Read",
      "Make the right transition shot decision based on where the retreating defender sets up.",
      ["Attack from half court.", "Defender steps up: attack past them to the rim."],
    );
    expect(findDuplicates([a, b])).toContainEqual(
      expect.objectContaining({ reason: "same_purpose" }),
    );
  });

  it("measures word overlap without stop words or plural noise", () => {
    expect(jaccard(words("the crossover dribbles"), words("crossover dribble"))).toBe(1);
    expect(jaccard(words("box out"), words("crossover"))).toBe(0);
  });

  it("every reviewed-distinct entry has a reason", () => {
    for (const [pair, reason] of Object.entries(REVIEWED_DISTINCT)) {
      expect(pair).toMatch(/^[a-z0-9-]+|[a-z0-9-]+$/);
      expect(reason.length, pair).toBeGreaterThan(20);
    }
  });

  it("finds no duplicate drills in the real library, per sport", () => {
    const content = loadContent();
    for (const sc of Object.values(content.bySport)) {
      const pairs = findDuplicates(
        sc.drills.map((d) => ({
          seedKey: d.seedKey,
          title: d.title,
          category: d.category,
          format: d.format,
          objective: d.content.objective,
          instructions: d.content.instructions,
        })),
      );
      const unreviewed = pairs.filter((p) => !REVIEWED_DISTINCT[`${p.a}|${p.b}`]);
      expect(unreviewed, `${sc.sportKey} duplicates`).toEqual([]);
    }
  });
});
