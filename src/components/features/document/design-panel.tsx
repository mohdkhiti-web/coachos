"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  applyPreset,
  BORDER_STYLES,
  DETAILED_ONLY_SECTIONS,
  DIVIDER_STYLES,
  FONT_FAMILIES,
  FOOTER_TEXT_MAX,
  HEADER_STYLES,
  MARGINS,
  MODES,
  ORIENTATIONS,
  PAPERS,
  PROMPT_MAX,
  PRESET_IDS,
  PRESETS,
  SPACINGS,
  type DocumentDesign,
  type PresetId,
  type Reflection,
  type SectionId,
} from "@/modules/documents";
import type { LogoDto } from "@/modules/media/dto";
import { ColorField, ContrastRow, Segmented } from "./controls";
import { LogoPicker } from "./logo-picker";

/**
 * Every control of the document design. The panel only edits a DocumentDesign value and reports it upward;
 * it never touches the preview — the model is rebuilt from the value, so what the controls say and what the
 * pages show cannot disagree. Groups are native disclosures (keyboard and screen-reader ready).
 */

const SECTION_GROUPS: ReadonlyArray<{ key: string; ids: readonly SectionId[] }> = [
  { key: "pages", ids: ["cover", "overview", "objectives", "equipment", "timeline"] },
  {
    key: "activities",
    ids: [
      "diagrams",
      "instructions",
      "coachingPoints",
      "commonMistakes",
      "safety",
      "progressions",
      "regressions",
      "variations",
    ],
  },
  { key: "notes", ids: ["coachNotes", "reflection"] },
];

function Group({
  title,
  children,
  open = true,
  id,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
  id: string;
}) {
  return (
    <details open={open} className="group border-b border-line last:border-b-0" data-group={id}>
      <summary className="focus-visible:outline-focus flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-1 py-3 text-base font-semibold text-ink marker:hidden focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
        {title}
        <span
          aria-hidden
          className="text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
        >
          ▾
        </span>
      </summary>
      <div className="space-y-4 px-1 pt-1 pb-5">{children}</div>
    </details>
  );
}

/** The parts of a design a preset controls: what "still matches the preset" is measured on. */
const lookOf = (d: DocumentDesign) =>
  JSON.stringify([d.colors, d.typography, d.header, d.frame, d.page.spacing]);

export function DesignPanel({
  design,
  preset,
  reflection,
  onDesign,
  onPreset,
  onReflection,
  header,
  showAnswers = true,
  baseLook,
  onResetLook,
  logos = [],
  canUploadLogo = false,
}: {
  design: DocumentDesign;
  preset: PresetId;
  reflection: Reflection;
  onDesign: (design: DocumentDesign) => void;
  onPreset: (preset: PresetId) => void;
  onReflection: (reflection: Reflection) => void;
  /** Shown first, above the presets (the session workspace puts the saved-template controls here). */
  header?: React.ReactNode;
  /** A template has no reflection ANSWERS (they belong to one session); it still has the prompts' wording. */
  showAnswers?: boolean;
  /** What "still as designed" means: the preset, plus the template's layer when there is one. */
  baseLook?: DocumentDesign;
  onResetLook?: () => void;
  /** The workspace's logos, and whether this person may upload one (assistants may only use them). */
  logos?: LogoDto[];
  canUploadLogo?: boolean;
}) {
  const t = useTranslations("sessions.design");
  const presetGroup = React.useId();
  const compact = design.mode === "compact";
  const customised = lookOf(design) !== lookOf(baseLook ?? applyPreset(design, preset));

  const setColors = (patch: Partial<DocumentDesign["colors"]>) =>
    onDesign({ ...design, colors: { ...design.colors, ...patch } });
  const setPage = (patch: Partial<DocumentDesign["page"]>) =>
    onDesign({ ...design, page: { ...design.page, ...patch } });
  const setSection = (id: SectionId, on: boolean) =>
    onDesign({ ...design, sections: { ...design.sections, [id]: on } });

  return (
    <div className="rounded-lg border border-line bg-surface-raised px-4">
      {header}
      <Group id="presets" title={t("groups.presets")}>
        <fieldset>
          <legend className="sr-only">{t("presets.legend")}</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {PRESET_IDS.map((id) => {
              const p = PRESETS[id];
              const checked = id === preset;
              return (
                <label
                  key={id}
                  className={cn(
                    "has-[:focus-visible]:outline-focus relative flex cursor-pointer flex-col gap-2 rounded-md border p-2.5 text-sm has-[:focus-visible]:outline-2",
                    checked
                      ? "border-accent bg-accent-soft"
                      : "border-line-strong bg-surface hover:bg-surface-sunken",
                  )}
                >
                  <input
                    type="radio"
                    name={presetGroup}
                    value={id}
                    checked={checked}
                    onChange={() => onPreset(id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className="flex h-6 overflow-hidden rounded-xs border border-line-strong"
                    style={{ background: p.colors.background }}
                  >
                    {[p.colors.primary, p.colors.secondary, p.colors.accent, p.colors.text].map(
                      (c, i) => (
                        <span key={i} className="flex-1" style={{ background: c }} />
                      ),
                    )}
                  </span>
                  <span className="font-medium text-ink">{t(`presets.${id}.name`)}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-muted">{t(`presets.${preset}.description`)}</p>
        </fieldset>
        {customised ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2 text-sm">
            <span className="text-ink-muted">
              {t("presets.customised", { name: t(`presets.${preset}.name`) })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => (onResetLook ? onResetLook() : onPreset(preset))}
            >
              <RotateCcw className="size-4" aria-hidden />
              {t("presets.reset")}
            </Button>
          </div>
        ) : null}
      </Group>

      <Group id="mode" title={t("groups.mode")}>
        <Segmented
          legend={t("mode.legend")}
          value={design.mode}
          options={MODES.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
          onChange={(mode) => onDesign({ ...design, mode })}
        />
        <p className="text-xs text-ink-muted">{t(`mode.${design.mode}Hint`)}</p>
      </Group>

      <Group id="page" title={t("groups.page")}>
        <Segmented
          legend={t("page.paper")}
          value={design.page.paper}
          options={PAPERS.map((v) => ({ value: v, label: t(`page.papers.${v}`) }))}
          onChange={(paper) => setPage({ paper })}
        />
        <Segmented
          legend={t("page.orientation")}
          value={design.page.orientation}
          options={ORIENTATIONS.map((v) => ({ value: v, label: t(`page.orientations.${v}`) }))}
          onChange={(orientation) => setPage({ orientation })}
        />
        <Segmented
          legend={t("page.margins")}
          value={design.page.margins}
          options={MARGINS.map((v) => ({ value: v, label: t(`page.marginSizes.${v}`) }))}
          onChange={(margins) => setPage({ margins })}
        />
        <Segmented
          legend={t("page.columns")}
          value={design.page.columns}
          options={[
            { value: 1, label: t("page.columnCount", { count: 1 }) },
            { value: 2, label: t("page.columnCount", { count: 2 }) },
          ]}
          onChange={(columns) => setPage({ columns: columns === 2 ? 2 : 1 })}
        />
        <p className="text-xs text-ink-muted">{t("page.columnsHint")}</p>
        <Segmented
          legend={t("page.spacing")}
          value={design.page.spacing}
          options={SPACINGS.map((v) => ({ value: v, label: t(`page.spacings.${v}`) }))}
          onChange={(spacing) => setPage({ spacing })}
        />
      </Group>

      <Group id="sections" title={t("groups.sections")}>
        {SECTION_GROUPS.map((group) => (
          <fieldset key={group.key} className="min-w-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">
              {t(`sectionGroups.${group.key}`)}
            </legend>
            <ul className="space-y-0.5">
              {group.ids.map((id) => {
                const locked = compact && DETAILED_ONLY_SECTIONS.includes(id);
                const hintId = `${presetGroup}-${id}-hint`;
                return (
                  <li key={id}>
                    <label
                      className={cn(
                        "flex min-h-10 items-center gap-3 rounded-md px-1 text-sm",
                        locked ? "cursor-not-allowed text-ink-muted" : "cursor-pointer text-ink",
                      )}
                    >
                      <Checkbox
                        checked={design.sections[id]}
                        disabled={locked}
                        aria-describedby={locked ? hintId : undefined}
                        onChange={(e) => setSection(id, e.target.checked)}
                      />
                      <span>{t(`sections.${id}`)}</span>
                      {locked ? (
                        <span id={hintId} className="ml-auto text-xs">
                          {t("sections.detailedOnly")}
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </Group>

      <Group id="colors" title={t("groups.colors")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {(["primary", "secondary", "accent", "text", "background"] as const).map((key) => (
            <ColorField
              key={key}
              label={t(`colors.${key}`)}
              value={design.colors[key]}
              onChange={(hex) => setColors({ [key]: hex })}
            />
          ))}
        </div>
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-ink">{t("contrast.title")}</h3>
          <ul className="space-y-1.5" aria-label={t("contrast.title")}>
            <ContrastRow
              label={t("contrast.text")}
              foreground={design.colors.text}
              background={design.colors.background}
              goodAt={4.5}
              badBelow={3}
              note={t("contrast.textNote")}
            />
            <ContrastRow
              label={t("contrast.primary")}
              foreground={design.colors.primary}
              background={design.colors.background}
              goodAt={3}
              note={t("contrast.graphicNote")}
            />
            <ContrastRow
              label={t("contrast.accent")}
              foreground={design.colors.accent}
              background={design.colors.background}
              goodAt={3}
              note={t("contrast.graphicNote")}
            />
          </ul>
        </div>
      </Group>

      <Group id="style" title={t("groups.style")} open={false}>
        <label className="block text-sm font-medium text-ink">
          {t("style.font")}
          <Select
            className="mt-1"
            value={design.typography.family}
            onChange={(e) =>
              onDesign({
                ...design,
                typography: { family: e.target.value as DocumentDesign["typography"]["family"] },
              })
            }
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {t(`fonts.${f}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink">
          {t("style.header")}
          <Select
            className="mt-1"
            value={design.header.style}
            onChange={(e) =>
              onDesign({
                ...design,
                header: { style: e.target.value as DocumentDesign["header"]["style"] },
              })
            }
          >
            {HEADER_STYLES.map((s) => (
              <option key={s} value={s}>
                {t(`headerStyles.${s}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink">
          {t("style.border")}
          <Select
            className="mt-1"
            value={design.frame.border}
            onChange={(e) =>
              onDesign({
                ...design,
                frame: {
                  ...design.frame,
                  border: e.target.value as DocumentDesign["frame"]["border"],
                },
              })
            }
          >
            {BORDER_STYLES.map((s) => (
              <option key={s} value={s}>
                {t(`borders.${s}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink">
          {t("style.divider")}
          <Select
            className="mt-1"
            value={design.frame.divider}
            onChange={(e) =>
              onDesign({
                ...design,
                frame: {
                  ...design.frame,
                  divider: e.target.value as DocumentDesign["frame"]["divider"],
                },
              })
            }
          >
            {DIVIDER_STYLES.map((s) => (
              <option key={s} value={s}>
                {t(`dividers.${s}`)}
              </option>
            ))}
          </Select>
        </label>
      </Group>

      <Group id="footer" title={t("groups.footer")} open={false}>
        <label className="block text-sm font-medium text-ink">
          {t("branding.clubName")}
          <Input
            className="mt-1"
            value={design.branding.clubName}
            maxLength={120}
            onChange={(e) =>
              onDesign({ ...design, branding: { ...design.branding, clubName: e.target.value } })
            }
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          {t("branding.coachName")}
          <Input
            className="mt-1"
            value={design.branding.coachName}
            maxLength={80}
            onChange={(e) =>
              onDesign({ ...design, branding: { ...design.branding, coachName: e.target.value } })
            }
          />
        </label>
        <p className="text-xs text-ink-muted">{t("branding.hint")}</p>
        <label className="block text-sm font-medium text-ink">
          {t("footer.text")}
          <Input
            className="mt-1"
            value={design.footer.text}
            maxLength={FOOTER_TEXT_MAX}
            onChange={(e) => onDesign({ ...design, footer: { text: e.target.value } })}
          />
        </label>
        <p className="text-xs text-ink-muted">{t("footer.hint")}</p>
        <LogoPicker
          value={design.logo}
          onChange={(logo) => onDesign({ ...design, logo })}
          logos={logos}
          canUpload={canUploadLogo}
        />
      </Group>

      <Group id="reflection" title={t("groups.reflection")} open={false}>
        {(["wentWell", "needsImprovement", "nextFocus", "notes"] as const).map((key) => (
          <label key={key} className="block text-sm font-medium text-ink">
            {t("reflection.wording", { prompt: t(`reflection.${key}`) })}
            <Input
              className="mt-1"
              value={design.prompts[key]}
              maxLength={PROMPT_MAX}
              placeholder={t(`reflection.${key}`)}
              onChange={(e) =>
                onDesign({ ...design, prompts: { ...design.prompts, [key]: e.target.value } })
              }
            />
          </label>
        ))}
        <p className="text-xs text-ink-muted">{t("reflection.wordingHint")}</p>
        {showAnswers ? (
          design.sections.reflection ? (
            (["wentWell", "needsImprovement", "nextFocus", "notes"] as const).map((key) => (
              <label key={key} className="block text-sm font-medium text-ink">
                {t(`reflection.${key}`)}
                <Textarea
                  className="mt-1 min-h-20"
                  value={reflection[key]}
                  maxLength={1500}
                  onChange={(e) => onReflection({ ...reflection, [key]: e.target.value })}
                />
              </label>
            ))
          ) : (
            <p className="text-sm text-ink-muted">{t("reflection.off")}</p>
          )
        ) : (
          <p className="text-xs text-ink-muted">{t("reflection.templateNote")}</p>
        )}
        {showAnswers ? <p className="text-xs text-ink-muted">{t("reflection.hint")}</p> : null}
      </Group>
    </div>
  );
}
