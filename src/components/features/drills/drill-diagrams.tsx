"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  describeDiagram,
  diagramSchema,
  validateDiagram,
  type Diagram,
  type DiagramInput,
} from "@/engines/diagram";
import { getSportModule, courtKey } from "@/sports/registry";
import { cn } from "@/lib/cn";
import { DiagramWorkspace } from "../diagram-workspace";

const MAX_DIAGRAMS = 3;

export type DiagramDraft = { title: string; diagram: DiagramInput };

const blank = (sportKey: string, court: DiagramInput["court"]): DiagramInput => ({
  schemaVersion: 1,
  sport: sportKey,
  court,
  entities: [],
  actions: [],
  annotations: [],
});

/**
 * The drill form's diagrams: up to three per drill (the setup, then progressions), each drawn in the full workspace. A new
 * drill opens with the court already on screen — the coach starts dragging at once — and nothing is added to the drill until
 * something is actually drawn.
 */
export function DrillDiagrams({
  sportKey,
  value,
  onChange,
  serverErrors,
  drillTitle,
}: {
  sportKey: string;
  value: DiagramDraft[];
  onChange: (next: DiagramDraft[]) => void;
  /** Field-path → message keys from the server, e.g. { "diagrams.0": ["diagram_out_of_bounds"] }. */
  serverErrors?: Record<string, string[]>;
  /** The drill's title, for the name of exported files and the printed sheet. */
  drillTitle?: string;
}) {
  const t = useTranslations("diagram.builder");
  const ti = useTranslations("diagram.issues");
  const tv = useTranslations("validation");
  const mod = getSportModule(sportKey);
  const [active, setActive] = React.useState(0);
  // bumped when a diagram is added or removed, so the workspace of the new tab starts from that diagram, not the last one
  const [revision, setRevision] = React.useState(0);
  if (!mod) return null;

  const drafts: DiagramDraft[] =
    value.length > 0 ? value : [{ title: "", diagram: blank(sportKey, mod.defaultCourt) }];
  const index = Math.min(active, drafts.length - 1);
  const draft = drafts[index]!;

  const parsed = diagramSchema.safeParse(draft.diagram);
  const pack = parsed.success ? mod.courts[courtKey(parsed.data.court)] : undefined;
  const issues = parsed.success && pack ? validateDiagram(parsed.data, pack) : [];
  const serverIssues = serverErrors?.[`diagrams.${index}`];

  const setDraft = (next: DiagramDraft) => {
    onChange(drafts.map((d, i) => (i === index ? next : d)));
  };

  return (
    <div className="space-y-4" data-testid="drill-diagrams">
      <div className="flex flex-wrap items-end gap-3">
        <div
          role="group"
          aria-label={t("diagramsLabel")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {drafts.map((d, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={i === index}
              data-testid={`diagram-tab-${i + 1}`}
              onClick={() => {
                setActive(i);
                setRevision((r) => r + 1);
              }}
              className={cn(
                "h-10 max-w-48 truncate rounded-md border px-3 text-sm font-medium smooth-colors",
                i === index
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
              )}
            >
              {d.title.trim() || t("diagramN", { n: i + 1 })}
            </button>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={drafts.length >= MAX_DIAGRAMS || value.length === 0}
            onClick={() => {
              onChange([...value, { title: "", diagram: blank(sportKey, mod.defaultCourt) }]);
              setActive(value.length);
              setRevision((r) => r + 1);
            }}
          >
            <Plus className="size-4" aria-hidden />
            {t("addDiagram")}
          </Button>
        </div>
        <Field label={t("titleLabel")} className="min-w-48 flex-1">
          {(c) => (
            <Input
              {...c}
              value={draft.title}
              maxLength={60}
              className="h-10 px-2.5 text-sm"
              placeholder={t("titlePlaceholder")}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          )}
        </Field>
        {value.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("removeDiagram", { n: index + 1 })}
            onClick={() => {
              onChange(value.filter((_, i) => i !== index));
              setActive(Math.max(0, index - 1));
              setRevision((r) => r + 1);
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            {t("remove")}
          </Button>
        ) : null}
      </div>
      {drafts.length >= MAX_DIAGRAMS ? (
        <p className="text-sm text-ink-muted">{t("maxDiagrams", { max: MAX_DIAGRAMS })}</p>
      ) : null}

      <DiagramWorkspace
        key={`${index}:${revision}`}
        diagram={draft.diagram}
        title={draft.title.trim() || drillTitle}
        templates={mod.diagramTemplates}
        onChange={(next: Diagram) => setDraft({ ...draft, diagram: next })}
      />

      <div role="status" aria-live="polite" className="space-y-2">
        {issues.length === 0 && (!serverIssues || serverIssues.length === 0) && parsed.success ? (
          <p className="text-sm font-medium text-success">{t("valid")}</p>
        ) : (
          <div
            data-invalid="true"
            tabIndex={-1}
            className="rounded-md border border-danger bg-danger-soft p-3"
          >
            <p className="text-sm font-semibold text-ink">{t("issuesTitle")}</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink">
              {!parsed.success ? <li>{t("schemaInvalid")}</li> : null}
              {issues.map((iss, k) => (
                <li key={k}>{ti.has(iss.code) ? ti(iss.code, iss.params ?? {}) : iss.code}</li>
              ))}
              {issues.length === 0
                ? (serverIssues ?? []).map((code) => (
                    <li key={code}>{tv.has(code) ? tv(code) : code}</li>
                  ))
                : null}
            </ul>
          </div>
        )}
      </div>

      {parsed.success ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted hover:text-ink">
            {t("description")}
          </summary>
          <p className="mt-2 text-ink-muted">{describeDiagram(parsed.data)}</p>
        </details>
      ) : null}
    </div>
  );
}
