import { describe, expect, it } from "vitest";
import { TEMPLATE_CATEGORIES } from "@/db/enums";
import { documentDesignSchema, presetDesign, PRESET_IDS, resolveDesign } from "@/modules/documents";
import {
  activeTemplateFilterCount,
  parseTemplateFilters,
  templateFiltersToSearchParams,
  templateHrefFor,
  templateStatusesFor,
} from "./filters";
import { buildTemplateConfig, canonicalJson, templateInputSchema } from "./validators";

const valid = (over: Record<string, unknown> = {}) => ({
  name: "Friday sheet",
  preset: "classic",
  design: presetDesign("classic"),
  ...over,
});

describe("template input", () => {
  it("needs a name and a complete design; everything else has a safe default", () => {
    const t = templateInputSchema.parse(valid());
    expect(t).toMatchObject({ description: "", category: "general", visibility: "private" });
    expect(templateInputSchema.safeParse(valid({ name: "   " })).success).toBe(false);
    expect(templateInputSchema.safeParse(valid({ name: "x".repeat(81) })).success).toBe(false);
    expect(templateInputSchema.safeParse(valid({ description: "x".repeat(301) })).success).toBe(
      false,
    );
    expect(templateInputSchema.safeParse({ name: "A", preset: "classic" }).success).toBe(false);
  });

  it("trims the name and description", () => {
    const t = templateInputSchema.parse(valid({ name: "  Friday sheet  ", description: "  Hi  " }));
    expect(t.name).toBe("Friday sheet");
    expect(t.description).toBe("Hi");
  });

  it("accepts every category and preset, and nothing else", () => {
    for (const category of TEMPLATE_CATEGORIES)
      expect(templateInputSchema.safeParse(valid({ category })).success, category).toBe(true);
    for (const preset of PRESET_IDS)
      expect(
        templateInputSchema.safeParse(valid({ preset, design: presetDesign(preset) })).success,
      ).toBe(true);
    expect(templateInputSchema.safeParse(valid({ category: "other" })).success).toBe(false);
    expect(templateInputSchema.safeParse(valid({ visibility: "public" })).success).toBe(false);
    expect(templateInputSchema.safeParse(valid({ preset: "neon" })).success).toBe(false);
  });

  it("refuses every field that belongs to one session, instead of ignoring it", () => {
    for (const key of [
      "scheduledDate",
      "startTime",
      "sessionNumber",
      "activities",
      "attendance",
      "coachNotes",
      "reflection",
      "planId",
    ])
      expect(templateInputSchema.safeParse(valid({ [key]: "x" })).success, key).toBe(false);
  });

  it("refuses a design with an unreadable colour, and an invalid one", () => {
    const d = presetDesign("classic");
    const bad = { ...d, colors: { ...d.colors, text: "not-a-colour" } };
    expect(templateInputSchema.safeParse(valid({ design: bad })).success).toBe(false);
  });
});

describe("the stored form of a template", () => {
  it("is the preset and only what the design changes on top of it", () => {
    const base = presetDesign("modern");
    const config = buildTemplateConfig("modern", {
      ...base,
      colors: { ...base.colors, accent: "#0a7d4b" },
      branding: { clubName: "Riverside BC", coachName: "" },
    });
    expect(config).toEqual({
      schemaVersion: 1,
      preset: "modern",
      design: { colors: { accent: "#0a7d4b" }, branding: { clubName: "Riverside BC" } },
    });
    expect(buildTemplateConfig("modern", base).design).toEqual({});
  });

  it("reads back to exactly the design that was saved", () => {
    const base = presetDesign("school");
    const design = {
      ...base,
      mode: "compact" as const,
      page: { ...base.page, paper: "letter" as const, orientation: "landscape" as const },
      prompts: { ...base.prompts, notes: "Anything else?" },
    };
    expect(documentDesignSchema.safeParse(design).success).toBe(true);
    const config = buildTemplateConfig("school", design);
    expect(resolveDesign({ preset: config.preset, override: config.design })).toEqual(design);
  });

  it("compares two configs by content, not by key order", () => {
    expect(canonicalJson({ a: 1, b: { d: [1, { y: 1, x: 2 }], c: undefined } })).toBe(
      canonicalJson({ b: { d: [1, { x: 2, y: 1 }] }, a: 1 }),
    );
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});

describe("the Templates page filters", () => {
  it("reads good values from the URL and drops bad ones without throwing", () => {
    expect(
      parseTemplateFilters({
        q: "  friday   sheet ",
        category: "school",
        scope: "mine",
        status: "archived",
        page: "3",
      }),
    ).toEqual({
      q: "friday sheet",
      category: "school",
      scope: "mine",
      status: "archived",
      page: 3,
    });
    expect(
      parseTemplateFilters({
        q: ["a", "b"],
        category: "nope",
        scope: "everyone",
        status: "x",
        page: "-2",
      }),
    ).toEqual({ q: "a", category: undefined, scope: undefined, status: undefined, page: 1 });
    expect(parseTemplateFilters({ page: "1.5" }).page).toBe(1);
    expect(parseTemplateFilters({ page: "9999" }).page).toBe(1);
    expect(parseTemplateFilters({ q: "x".repeat(200) }).q).toHaveLength(80);
  });

  it("writes a short, canonical URL: defaults are left out", () => {
    expect(templateFiltersToSearchParams({ q: "", page: 1 }).toString()).toBe("");
    expect(templateHrefFor("/templates/basketball", { category: "youth", page: 2 })).toBe(
      "/templates/basketball?category=youth&page=2",
    );
    expect(templateHrefFor("/templates", {})).toBe("/templates");
  });

  it("counts only the narrowing filters", () => {
    expect(activeTemplateFilterCount(parseTemplateFilters({ page: "4" }))).toBe(0);
    expect(activeTemplateFilterCount(parseTemplateFilters({ q: "a", scope: "mine" }))).toBe(2);
  });

  it("maps the status filter onto live, archived and trash", () => {
    expect(templateStatusesFor(undefined)).toEqual({ statuses: ["active"], trash: false });
    expect(templateStatusesFor("archived")).toEqual({ statuses: ["archived"], trash: false });
    expect(templateStatusesFor("deleted")).toEqual({ statuses: [], trash: true });
  });
});
