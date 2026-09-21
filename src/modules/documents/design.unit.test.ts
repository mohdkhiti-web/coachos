import { describe, expect, it } from "vitest";
import { contrastRatio, luminance, mix, normalizeHex, onColor, readableOn, toRgb } from "./color";
import {
  activitySectionShown,
  checkDesign,
  DETAILED_ONLY_SECTIONS,
  defaultDocumentSettings,
  deriveTokens,
  designOverrideSchema,
  documentDesignSchema,
  documentSettingsSchema,
  FONT_FAMILIES,
  hasBlockingIssue,
  migrateDocumentSettings,
  PRESET_IDS,
  SECTION_IDS,
  type DocumentDesign,
} from "./design";
import { designCssVars, pageGeometry, PAPER_MM } from "./layout";
import {
  applyPreset,
  DEFAULT_PRESET,
  diffDesign,
  PRESETS,
  presetDesign,
  resolveDesign,
} from "./presets";

const withPage = (patch: Partial<DocumentDesign["page"]>, base = presetDesign("classic")) => ({
  ...base,
  page: { ...base.page, ...patch },
});

describe("colour maths", () => {
  it("normalises #RGB and #RRGGBB in any case, and rejects everything else", () => {
    expect(normalizeHex("#1F3A5F")).toBe("#1f3a5f");
    expect(normalizeHex("  #abc ")).toBe("#aabbcc");
    for (const bad of ["red", "#12", "#12345", "#1234567", "1f3a5f", "#gggggg", "", "rgb(0,0,0)"])
      expect(normalizeHex(bad), bad).toBeNull();
  });

  it("computes WCAG contrast: black on white is 21, identical colours are 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    // a known reference: #767676 on white is the classic AA boundary (4.54)
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBeCloseTo(0, 5);
  });

  it("mixes colours linearly and picks readable text for a fill", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#102030", "#ffffff", 0)).toBe("#102030");
    expect(toRgb(mix("#ff0000", "#0000ff", 1))).toEqual([0, 0, 255]);
    expect(onColor("#ffffff")).toBe("#111111");
    expect(onColor("#0b3d91")).toBe("#ffffff");
    // a light amber fill (the Dark preset's band) gets dark text, a navy one white
    expect(contrastRatio(onColor("#f59e0b"), "#f59e0b")).toBeGreaterThanOrEqual(7);
  });

  it("pulls a weak colour towards readable without touching a good one", () => {
    expect(readableOn("#1f3a5f", "#ffffff")).toBe("#1f3a5f");
    const yellow = readableOn("#ffe600", "#ffffff");
    expect(yellow).not.toBe("#ffe600");
    expect(contrastRatio(yellow, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // on a dark page it moves towards white instead
    const navyOnDark = readableOn("#0b3d91", "#0f172a");
    expect(contrastRatio(navyOnDark, "#0f172a")).toBeGreaterThanOrEqual(4.5);
    expect(luminance(navyOnDark)).toBeGreaterThan(luminance("#0b3d91"));
  });
});

describe("the design schema", () => {
  const design = presetDesign("classic");

  it("accepts a complete design and normalises its colours", () => {
    const parsed = documentDesignSchema.parse({
      ...design,
      colors: { ...design.colors, primary: "#ABC" },
    });
    expect(parsed.colors.primary).toBe("#aabbcc");
  });

  it("rejects invalid colours, one field at a time", () => {
    for (const key of ["primary", "secondary", "accent", "text", "background"] as const) {
      const r = documentDesignSchema.safeParse({
        ...design,
        colors: { ...design.colors, [key]: "blue" },
      });
      expect(r.success, key).toBe(false);
      if (!r.success)
        expect(r.error.issues[0]).toMatchObject({ path: ["colors", key], message: "hex_invalid" });
    }
  });

  it("rejects unknown paper, orientation, margins, columns, spacing, mode, fonts and unknown keys", () => {
    const bad = (patch: object) => documentDesignSchema.safeParse({ ...design, ...patch }).success;
    expect(bad({ page: { ...design.page, paper: "a3" } })).toBe(false);
    expect(bad({ page: { ...design.page, orientation: "diagonal" } })).toBe(false);
    expect(bad({ page: { ...design.page, margins: "huge" } })).toBe(false);
    expect(bad({ page: { ...design.page, columns: 3 } })).toBe(false);
    expect(bad({ page: { ...design.page, spacing: "loose" } })).toBe(false);
    expect(bad({ mode: "verbose" })).toBe(false);
    expect(bad({ typography: { family: "comic-sans" } })).toBe(false);
    expect(bad({ header: { style: "neon" } })).toBe(false);
    expect(bad({ sections: { ...design.sections, cover: "yes" } })).toBe(false);
    expect(bad({ extra: true })).toBe(false);
    expect(bad({ logo: { assetId: "not-a-uuid" } })).toBe(false);
    expect(bad({ footer: { text: "x".repeat(121) } })).toBe(false);
  });

  it("has a switch for every section the coach can turn off, and only those", () => {
    expect([...SECTION_IDS].sort()).toEqual(Object.keys(design.sections).sort());
    expect(SECTION_IDS).toHaveLength(15);
  });

  it("carries a logo as a reference to stored media, never as inline data", () => {
    const id = "01a0c262-7596-7410-91b4-08c214915c45";
    const withLogo = documentDesignSchema.parse({ ...design, logo: { assetId: id } });
    expect(withLogo.logo).toEqual({ assetId: id });
    expect(
      documentDesignSchema.safeParse({ ...design, logo: { assetId: id, data: "x" } }).success,
    ).toBe(false);
  });
});

describe("presets", () => {
  it("offers the eight coach-facing looks", () => {
    expect([...PRESET_IDS]).toEqual([
      "classic",
      "modern",
      "minimal",
      "professional",
      "dark",
      "school",
      "academy",
      "youth",
    ]);
    expect(DEFAULT_PRESET).toBe("classic");
  });

  it.each(PRESET_IDS)("%s is a complete, valid design with readable text", (id) => {
    const design = presetDesign(id);
    expect(documentDesignSchema.safeParse(design).success).toBe(true);
    const { text, background, primary } = design.colors;
    // body text is at least AAA (7:1) on the page; primary reads as a shape (3:1)
    expect(contrastRatio(text, background), `${id} text`).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(primary, background), `${id} primary`).toBeGreaterThanOrEqual(3);
    expect(checkDesign(design).filter((i) => i.severity === "error")).toEqual([]);
    // the derived text colours are readable on the strongest tint they can sit on
    const t = deriveTokens(design.colors);
    for (const ink of [t.primaryInk, t.secondaryInk, t.accentInk, t.muted])
      expect(contrastRatio(ink, t.tintStrong), `${id} ${ink}`).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.onPrimary, t.primary), `${id} on primary`).toBeGreaterThanOrEqual(4.5);
  });

  it("style only: choosing a preset leaves content, sections, paper and margins alone", () => {
    const mine: DocumentDesign = {
      ...presetDesign("classic"),
      mode: "compact",
      page: {
        paper: "letter",
        orientation: "landscape",
        margins: "wide",
        columns: 2,
        spacing: "normal",
      },
      sections: {
        ...presetDesign("classic").sections,
        cover: true,
        reflection: true,
        timeline: false,
      },
      footer: { text: "Riverside BC" },
    };
    for (const id of PRESET_IDS) {
      const next = applyPreset(mine, id);
      expect(next.mode).toBe("compact");
      expect(next.sections).toEqual(mine.sections);
      expect(next.footer).toEqual(mine.footer);
      expect(next.page).toMatchObject({
        paper: "letter",
        orientation: "landscape",
        margins: "wide",
        columns: 2,
      });
      expect(next.colors).toEqual(PRESETS[id].colors);
      expect(next.typography.family).toBe(PRESETS[id].family);
      expect(next.header.style).toBe(PRESETS[id].header);
    }
  });

  it("uses only the small, self-hosted set of typefaces", () => {
    expect([...FONT_FAMILIES]).toEqual(["inter", "source-sans", "merriweather", "system"]);
    for (const id of PRESET_IDS) expect(FONT_FAMILIES).toContain(PRESETS[id].family);
  });
});

describe("Preset → Template → Session override", () => {
  it("resolves in that order, each layer changing only what it names", () => {
    const resolved = resolveDesign({
      preset: "modern",
      template: { colors: { accent: "#123456" }, page: { paper: "letter" }, mode: "compact" },
      override: { colors: { accent: "#654321" }, page: { margins: "wide" } },
    });
    const preset = presetDesign("modern");
    expect(resolved.colors.accent).toBe("#654321"); // the session wins over the template
    expect(resolved.colors.primary).toBe(preset.colors.primary); // untouched values come from the preset
    expect(resolved.page.paper).toBe("letter"); // the template beats the preset
    expect(resolved.page.margins).toBe("wide");
    expect(resolved.mode).toBe("compact");
    expect(documentDesignSchema.safeParse(resolved).success).toBe(true);
  });

  it("with no template and no override, is exactly the preset", () => {
    for (const id of PRESET_IDS) expect(resolveDesign({ preset: id })).toEqual(presetDesign(id));
  });

  it("stores the smallest override and round-trips it exactly", () => {
    const base = presetDesign("school");
    const mine: DocumentDesign = {
      ...base,
      colors: { ...base.colors, accent: "#0a7d4b" },
      page: { ...base.page, paper: "letter", orientation: "landscape" },
      sections: { ...base.sections, cover: true },
      footer: { text: "PE department" },
    };
    const override = diffDesign(base, mine);
    expect(override).toEqual({
      colors: { accent: "#0a7d4b" },
      page: { paper: "letter", orientation: "landscape" },
      sections: { cover: true },
      footer: { text: "PE department" },
    });
    expect(designOverrideSchema.safeParse(override).success).toBe(true);
    expect(resolveDesign({ preset: "school", override })).toEqual(mine);
    expect(diffDesign(base, base)).toEqual({});
  });
});

describe("readability check", () => {
  const colors = (patch: Partial<DocumentDesign["colors"]>) => ({
    colors: { ...presetDesign("classic").colors, ...patch },
  });

  it("passes a good design with nothing to say", () => {
    expect(checkDesign(presetDesign("classic"))).toEqual([]);
  });

  it("warns on text that is readable but below AA, and refuses text that is not readable at all", () => {
    const grey = checkDesign(colors({ text: "#8a8a8a" })); // ≈ 3.4:1 on white
    expect(grey).toEqual([expect.objectContaining({ code: "text_low", severity: "warning" })]);
    expect(hasBlockingIssue(grey)).toBe(false);

    const same = checkDesign(colors({ text: "#ffffff" }));
    expect(same).toContainEqual(
      expect.objectContaining({ code: "text_unreadable", severity: "error" }),
    );
    expect(hasBlockingIssue(same)).toBe(true);
    expect(hasBlockingIssue(checkDesign(colors({ text: "#000000", background: "#000000" })))).toBe(
      true,
    );
  });

  it("warns (never blocks) when the primary or accent colour is faint on the page", () => {
    const faint = checkDesign(colors({ primary: "#f5f5f5", accent: "#fafafa" }));
    expect(faint.map((i) => i.code).sort()).toEqual(["accent_low", "primary_low"]);
    expect(hasBlockingIssue(faint)).toBe(false);
  });

  it("keeps coloured TEXT readable even when the coach picks a pale colour", () => {
    const t = deriveTokens({
      ...presetDesign("classic").colors,
      primary: "#ffee00",
      accent: "#fff3a0",
    });
    expect(contrastRatio(t.primaryInk, t.tintStrong)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.accentInk, t.tintStrong)).toBeGreaterThanOrEqual(4.5);
    expect(t.primary).toBe("#ffee00"); // the fill keeps the coach's exact colour
  });
});

describe("what a compact document leaves out", () => {
  it("hides the detailed-only sections in compact mode and honours the toggles in detailed", () => {
    const detailed = presetDesign("classic");
    const compact: DocumentDesign = { ...detailed, mode: "compact" };
    for (const id of DETAILED_ONLY_SECTIONS) {
      expect(activitySectionShown(detailed, id), id).toBe(true);
      expect(activitySectionShown(compact, id), id).toBe(false);
    }
    expect(activitySectionShown(compact, "coachingPoints")).toBe(true);
    expect(activitySectionShown(compact, "diagrams")).toBe(true);
    const off = { ...detailed, sections: { ...detailed.sections, safety: false } };
    expect(activitySectionShown(off, "safety")).toBe(false);
    expect(activitySectionShown(off, "instructions")).toBe(true);
  });
});

describe("stored settings (versioned)", () => {
  it("a session that was never customised stores {} and reads as the default preset", () => {
    expect(migrateDocumentSettings({})).toEqual(defaultDocumentSettings());
    expect(defaultDocumentSettings()).toMatchObject({
      schemaVersion: 1,
      preset: "classic",
      overrides: {},
      reflection: { wentWell: "", needsImprovement: "", nextFocus: "", notes: "" },
    });
  });

  it("round-trips a saved design and keeps the reflection beside it, not inside it", () => {
    const settings = documentSettingsSchema.parse({
      preset: "dark",
      overrides: { page: { paper: "letter" }, sections: { cover: true } },
      reflection: { wentWell: "Sharp press release." },
    });
    expect(migrateDocumentSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
    expect(settings.reflection.wentWell).toBe("Sharp press release.");
    expect(Object.keys(settings.overrides)).not.toContain("reflection");
  });

  it("refuses a version it does not know and anything it cannot validate (the caller falls back)", () => {
    expect(migrateDocumentSettings({ schemaVersion: 2, preset: "classic" })).toBeNull();
    expect(migrateDocumentSettings({ schemaVersion: 1, preset: "neon" })).toBeNull();
    expect(
      migrateDocumentSettings({ schemaVersion: 1, overrides: { colors: { primary: "x" } } }),
    ).toBeNull();
    expect(migrateDocumentSettings({ schemaVersion: 1, surprise: true })).toBeNull();
    expect(migrateDocumentSettings(null)).toBeNull();
    expect(migrateDocumentSettings([])).toBeNull();
    expect(migrateDocumentSettings("classic")).toBeNull();
  });

  it("limits reflection text", () => {
    expect(
      documentSettingsSchema.safeParse({ reflection: { wentWell: "x".repeat(1501) } }).success,
    ).toBe(false);
  });
});

describe("page geometry", () => {
  it("gives A4 and Letter their real sizes, and swaps them in landscape", () => {
    expect(PAPER_MM.a4).toEqual({ w: 210, h: 297 });
    expect(PAPER_MM.letter).toEqual({ w: 215.9, h: 279.4 });
    const a4 = pageGeometry(withPage({ paper: "a4", orientation: "portrait" }));
    expect([a4.widthMm, a4.heightMm]).toEqual([210, 297]);
    const a4l = pageGeometry(withPage({ paper: "a4", orientation: "landscape" }));
    expect([a4l.widthMm, a4l.heightMm]).toEqual([297, 210]);
    const letter = pageGeometry(withPage({ paper: "letter", orientation: "portrait" }));
    expect([letter.widthMm, letter.heightMm]).toEqual([215.9, 279.4]);
    const letterL = pageGeometry(withPage({ paper: "letter", orientation: "landscape" }));
    expect([letterL.widthMm, letterL.heightMm]).toEqual([279.4, 215.9]);
  });

  it("narrow, normal and wide margins shrink the body in that order", () => {
    const body = (margins: "narrow" | "normal" | "wide") =>
      pageGeometry(withPage({ margins })).bodyWidthMm;
    expect(body("narrow")).toBeGreaterThan(body("normal"));
    expect(body("normal")).toBeGreaterThan(body("wide"));
    expect(pageGeometry(withPage({ margins: "normal" })).marginMm).toBe(18);
  });

  it("two columns halve the column width (less the gutter); one column is the whole body", () => {
    const one = pageGeometry(withPage({ columns: 1 }));
    const two = pageGeometry(withPage({ columns: 2 }));
    expect(one.columnWidthMm).toBe(one.bodyWidthMm);
    expect(two.columnWidthMm).toBeCloseTo((two.bodyWidthMm - two.columnGapMm) / 2, 1);
  });

  it("gives back the running header's height only when there is a header", () => {
    const base = presetDesign("classic");
    const none = pageGeometry({ ...base, header: { style: "none" } });
    const line = pageGeometry({ ...base, header: { style: "line" } });
    expect(none.bodyHeightMm).toBeGreaterThan(line.bodyHeightMm);
    expect(line.headerMm).toBe(10);
  });

  it("hands the stylesheet everything as custom properties (colours, page and part sizes)", () => {
    const vars = designCssVars(presetDesign("modern"));
    expect(vars["--d-primary"]).toBe("#ea580c");
    expect(vars["--d-page-w"]).toBe("210mm");
    expect(vars["--d-page-h"]).toBe("297mm");
    expect(vars["--d-body-h"]).toMatch(/^\d+(\.\d+)?mm$/);
    for (const [k, v] of Object.entries(vars)) {
      expect(k.startsWith("--d-"), k).toBe(true);
      expect(v, k).not.toContain("undefined");
    }
  });
});
