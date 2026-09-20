"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  describeDiagram,
  diagramSchema,
  validateDiagram,
  type Diagram as ParsedDiagram,
  type Position,
} from "@/engines/diagram";
import { getSportModule, courtKey } from "@/sports/registry";
import { DrillDiagram } from "../drill-diagram";
import {
  ACTION_TYPES,
  ENTITY_KINDS,
  blankDiagram,
  carriers,
  entityName,
  kindOf,
  newAction,
  newAnnotation,
  newEntity,
  pickAnchor,
  removeEntity,
  type Action,
  type ActionKind,
  type Annotation,
  type Diagram,
  type Entity,
} from "./model";
import { PositionPicker } from "./position-picker";

const MAX_DIAGRAMS = 3;
const compact = "h-10 px-2.5 text-sm";

export type DiagramDraft = { title: string; diagram: Diagram };

/**
 * Phase 2 diagram editor (ARCHITECTURE.md §10.5, "Phase 2c" scoped down honestly): a STRUCTURED editor —
 * add players and equipment, place them on named court spots, describe passes, cuts, dribbles, screens
 * and shots as steps — with a live SVG preview and live validation. It edits the same typed JSON the
 * renderer and validators use. A drag-and-drop canvas is a later phase; nothing here pretends otherwise.
 */
export function DiagramBuilder({
  sportKey,
  value,
  onChange,
  serverErrors,
}: {
  sportKey: string;
  value: DiagramDraft[];
  onChange: (next: DiagramDraft[]) => void;
  /** Field-path → message keys from the server, e.g. { "diagrams.0": ["diagram_out_of_bounds"] }. */
  serverErrors?: Record<string, string[]>;
}) {
  const t = useTranslations("diagram.builder");
  const mod = getSportModule(sportKey);
  if (!mod) return null;

  const add = () =>
    onChange([...value, { title: "", diagram: blankDiagram(sportKey, mod.defaultCourt) }]);

  return (
    <div className="space-y-6">
      {value.length === 0 ? <p className="text-sm text-ink-muted">{t("noneYet")}</p> : null}

      {value.map((g, i) => (
        <DiagramEditor
          key={i}
          index={i}
          sportKey={sportKey}
          draft={g}
          serverIssues={serverErrors?.[`diagrams.${i}`]}
          onChange={(next) => onChange(value.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={add}
        disabled={value.length >= MAX_DIAGRAMS}
      >
        <Plus className="size-4" aria-hidden />
        {t("addDiagram")}
      </Button>
      {value.length >= MAX_DIAGRAMS ? (
        <p className="text-sm text-ink-muted">{t("maxDiagrams", { max: MAX_DIAGRAMS })}</p>
      ) : null}
    </div>
  );
}

function DiagramEditor({
  index,
  sportKey,
  draft,
  serverIssues,
  onChange,
  onRemove,
}: {
  index: number;
  sportKey: string;
  draft: DiagramDraft;
  serverIssues?: string[];
  onChange: (d: DiagramDraft) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("diagram.builder");
  const ti = useTranslations("diagram.issues");
  const tv = useTranslations("validation");
  const mod = getSportModule(sportKey)!;
  const g = draft.diagram;
  const pack = mod.courts[courtKey(g.court)];
  const set = (patch: Partial<Diagram>) => onChange({ ...draft, diagram: { ...g, ...patch } });

  const parsed = React.useMemo(() => diagramSchema.safeParse(g), [g]);
  const issues = React.useMemo(
    () => (parsed.success && pack ? validateDiagram(parsed.data as ParsedDiagram, pack) : []),
    [parsed, pack],
  );
  const anchorNames = pack ? Object.keys(pack.anchors) : [];
  // where new movement/notes start: a visible mid-court spot rather than under the basket
  const firstAnchor = pickAnchor(anchorNames, ["free_throw_line", "top_key"]);
  const actions = g.actions ?? [];
  const annotations = g.annotations ?? [];

  if (!pack) return <p role="alert">{t("courtMissing")}</p>;

  const issueText = (code: string, params?: Record<string, string | number>) =>
    ti.has(code) ? ti(code, params ?? {}) : code;

  return (
    <section
      aria-label={t("diagramN", { n: index + 1 })}
      className="rounded-lg border border-line bg-surface-sunken/40"
    >
      <header className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <span className="numeral text-2xl leading-none font-semibold text-accent" aria-hidden>
          {String(index + 1).padStart(2, "0")}
        </span>
        <Field label={t("titleLabel")} className="min-w-48 flex-1">
          {(c) => (
            <Input
              {...c}
              value={draft.title}
              maxLength={60}
              className={compact}
              placeholder={t("titlePlaceholder")}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
            />
          )}
        </Field>
        <Field label={t("court")} className="w-40">
          {(c) => (
            <Select
              {...c}
              className={compact}
              value={g.court.type}
              onChange={(e) =>
                set({ court: { ...g.court, type: e.target.value as "half" | "full" } })
              }
            >
              <option value="half">{t("courts.half")}</option>
              <option value="full">{t("courts.full")}</option>
            </Select>
          )}
        </Field>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={t("removeDiagram", { n: index + 1 })}
        >
          <Trash2 className="size-4" aria-hidden />
          {t("remove")}
        </Button>
      </header>

      <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* ---------------- editors ---------------- */}
        <div className="min-w-0 space-y-7">
          {/* entities */}
          <fieldset className="space-y-3">
            <legend className="mb-2 eyebrow">{t("entities")}</legend>
            {g.entities.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("entitiesEmpty")}</p>
            ) : null}
            <ul className="space-y-3">
              {g.entities.map((e, i) => (
                <li key={e.id} className="rounded-md border border-line bg-surface-raised p-3">
                  <EntityRow
                    entity={e}
                    pack={pack}
                    entities={g.entities}
                    onChange={(next) =>
                      set({ entities: g.entities.map((x, j) => (j === i ? next : x)) })
                    }
                    onRemove={() => set(removeEntity(g, e.id, pack))}
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("addEntity")}>
              {ENTITY_KINDS.map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={g.entities.length >= 30}
                  onClick={() =>
                    set({ entities: [...g.entities, newEntity(k, g.entities, anchorNames)] })
                  }
                >
                  <Plus className="size-3.5" aria-hidden />
                  {t(`add.${k}`)}
                </Button>
              ))}
            </div>
          </fieldset>

          {/* actions */}
          <fieldset className="space-y-3">
            <legend className="mb-2 eyebrow">{t("actions")}</legend>
            <p className="text-sm text-ink-muted">{t("actionsHelp")}</p>
            <ul className="space-y-3">
              {actions.map((a, i) => (
                <li key={a.id} className="rounded-md border border-line bg-surface-raised p-3">
                  <ActionRow
                    action={a}
                    diagram={g}
                    pack={pack}
                    onChange={(next) =>
                      set({ actions: actions.map((x, j) => (j === i ? next : x)) })
                    }
                    onRemove={() => set({ actions: actions.filter((_, j) => j !== i) })}
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("addAction")}>
              {ACTION_TYPES.map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={carriers(g).length === 0 || actions.length >= 60}
                  onClick={() => set({ actions: [...actions, newAction(k, g, firstAnchor)] })}
                >
                  <Plus className="size-3.5" aria-hidden />
                  {t(`actionTypes.${k}`)}
                </Button>
              ))}
            </div>
          </fieldset>

          {/* annotations */}
          <fieldset className="space-y-3">
            <legend className="mb-2 eyebrow">{t("notes")}</legend>
            <ul className="space-y-3">
              {annotations.map((n, i) => (
                <li key={i} className="rounded-md border border-line bg-surface-raised p-3">
                  <AnnotationRow
                    annotation={n}
                    pack={pack}
                    entities={g.entities}
                    index={i}
                    onChange={(next) =>
                      set({ annotations: annotations.map((x, j) => (j === i ? next : x)) })
                    }
                    onRemove={() => set({ annotations: annotations.filter((_, j) => j !== i) })}
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("addNote")}>
              {(["text", "zone_rect", "zone_circle"] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={annotations.length >= 20}
                  onClick={() =>
                    set({ annotations: [...annotations, newAnnotation(k, firstAnchor)] })
                  }
                >
                  <Plus className="size-3.5" aria-hidden />
                  {t(`annotationTypes.${k}`)}
                </Button>
              ))}
            </div>
          </fieldset>
        </div>

        {/* ---------------- preview ---------------- */}
        <div className="min-w-0 space-y-3 lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow">{t("preview")}</p>
          <div className="overflow-hidden rounded-lg border border-line bg-surface-raised">
            {parsed.success ? (
              <DrillDiagram
                diagram={parsed.data as ParsedDiagram}
                title={draft.title || t("diagramN", { n: index + 1 })}
                className="mx-auto max-h-[28rem] w-full"
              />
            ) : (
              <p className="p-4 text-sm text-ink-muted">{t("previewInvalid")}</p>
            )}
          </div>

          <div role="status" aria-live="polite" className="space-y-2">
            {issues.length === 0 &&
            (!serverIssues || serverIssues.length === 0) &&
            parsed.success ? (
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
                    <li key={k}>{issueText(iss.code, iss.params)}</li>
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
              <p className="mt-2 text-ink-muted">{describeDiagram(parsed.data as ParsedDiagram)}</p>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------------------------------
// entity / action / annotation rows
// -------------------------------------------------------------------------------------------------

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10 shrink-0"
      onClick={onClick}
      aria-label={label}
    >
      <Trash2 className="size-4" aria-hidden />
    </Button>
  );
}

function EntityRow({
  entity: e,
  entities,
  pack,
  onChange,
  onRemove,
}: {
  entity: Entity;
  entities: Entity[];
  pack: Parameters<typeof PositionPicker>[0]["pack"];
  onChange: (e: Entity) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("diagram.builder");
  const name = entityName(e);
  const holders = carriers({ entities } as Diagram);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink">
          {t(`kinds.${kindOf(e)}`)} <span className="numeral text-ink-muted">· {name}</span>
        </p>
        <RemoveButton
          label={t("removeItem", { name: `${t(`kinds.${kindOf(e)}`)} ${name}` })}
          onClick={onRemove}
        />
      </div>

      {e.type === "player" || e.type === "coach" || e.type === "marker" ? (
        <div className="grid gap-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
          <label className="block text-xs text-ink-muted">
            {t("label")}
            <Input
              className={`${compact} mt-1`}
              maxLength={3}
              value={e.label ?? ""}
              onChange={(ev) =>
                onChange({
                  ...e,
                  label: ev.target.value.trim() === "" ? undefined : ev.target.value,
                } as Entity)
              }
            />
          </label>
          <div className="space-y-2">
            {e.type === "marker" ? (
              <label className="block text-xs text-ink-muted">
                {t("markerKind")}
                <Select
                  className={`${compact} mt-1`}
                  value={e.kind}
                  onChange={(ev) =>
                    onChange({ ...e, kind: ev.target.value as "start" | "end" | "spot" })
                  }
                >
                  {(["start", "end", "spot"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`markerKinds.${k}`)}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <PositionPicker
              label={`${t("kinds." + kindOf(e))} ${name}`}
              value={e.at}
              pack={pack}
              entities={entities.filter((x) => x.id !== e.id)}
              onChange={(at) => onChange({ ...e, at } as Entity)}
            />
          </div>
        </div>
      ) : null}

      {e.type === "cone" ? (
        <PositionPicker
          label={`${t("kinds.cone")} ${name}`}
          value={e.at}
          pack={pack}
          entities={entities.filter((x) => x.id !== e.id)}
          onChange={(at) => onChange({ ...e, at })}
        />
      ) : null}

      {e.type === "ball" ? (
        <div className="space-y-2">
          <label className="block text-xs text-ink-muted">
            {t("ballState")}
            <Select
              className={`${compact} mt-1`}
              value={e.heldBy ? "held" : "loose"}
              onChange={(ev) =>
                ev.target.value === "held"
                  ? onChange({ id: e.id, type: "ball", heldBy: holders[0]?.id ?? "" })
                  : onChange({
                      id: e.id,
                      type: "ball",
                      at: { anchor: Object.keys(pack.anchors)[0] ?? "basket" },
                    })
              }
            >
              <option value="held" disabled={holders.length === 0}>
                {t("ballHeld")}
              </option>
              <option value="loose">{t("ballLoose")}</option>
            </Select>
          </label>
          {e.heldBy !== undefined ? (
            <label className="block text-xs text-ink-muted">
              {t("heldBy")}
              <Select
                className={`${compact} mt-1`}
                value={e.heldBy}
                onChange={(ev) => onChange({ ...e, heldBy: ev.target.value })}
              >
                {holders.map((h) => (
                  <option key={h.id} value={h.id}>
                    {entityName(h)}
                  </option>
                ))}
              </Select>
            </label>
          ) : e.at ? (
            <PositionPicker
              label={`${t("kinds.ball")} ${name}`}
              value={e.at}
              pack={pack}
              entities={entities.filter((x) => x.id !== e.id)}
              onChange={(at) => onChange({ ...e, at })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PlayerSelect({
  label,
  value,
  people,
  onChange,
}: {
  label: string;
  value: string;
  people: Entity[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="block text-xs text-ink-muted">
      {label}
      <Select
        className={`${compact} mt-1`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!people.some((p) => p.id === value) ? (
          <option value={value}>{value || "—"} ⚠</option>
        ) : null}
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {entityName(p)}
          </option>
        ))}
      </Select>
    </label>
  );
}

function ActionRow({
  action: a,
  diagram,
  pack,
  onChange,
  onRemove,
}: {
  action: Action;
  diagram: Diagram;
  pack: Parameters<typeof PositionPicker>[0]["pack"];
  onChange: (a: Action) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("diagram.builder");
  const people = carriers(diagram);
  const title = t(`actionTypes.${a.type as ActionKind}`);
  const move = a.type === "cut" || a.type === "move" || a.type === "dribble";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{title}</p>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          {t("step")}
          <Input
            type="number"
            className={`${compact} w-16`}
            min={1}
            max={12}
            value={a.step ?? 1}
            aria-label={`${title}: ${t("step")}`}
            onChange={(e) =>
              onChange({
                ...a,
                step: Math.min(12, Math.max(1, Math.round(Number(e.target.value) || 1))),
              } as Action)
            }
          />
        </label>
        <RemoveButton label={t("removeItem", { name: title })} onClick={onRemove} />
      </div>

      {a.type === "pass" ? (
        <div className="grid grid-cols-2 gap-2">
          <PlayerSelect
            label={t("from")}
            value={a.from}
            people={people}
            onChange={(from) => onChange({ ...a, from })}
          />
          <PlayerSelect
            label={t("to")}
            value={a.to}
            people={people}
            onChange={(to) => onChange({ ...a, to })}
          />
        </div>
      ) : (
        <PlayerSelect
          label={t("player")}
          value={a.entity}
          people={people}
          onChange={(entity) => onChange({ ...a, entity } as Action)}
        />
      )}

      {move ? (
        <div className="space-y-2">
          {a.path.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <PositionPicker
                  label={`${title}: ${t("waypoint", { n: i + 1 })}`}
                  value={p}
                  pack={pack}
                  entities={diagram.entities}
                  onChange={(np) =>
                    onChange({ ...a, path: a.path.map((x, j) => (j === i ? np : x)) } as Action)
                  }
                />
              </div>
              {a.path.length > 1 ? (
                <RemoveButton
                  label={t("removeWaypoint", { n: i + 1 })}
                  onClick={() =>
                    onChange({ ...a, path: a.path.filter((_, j) => j !== i) } as Action)
                  }
                />
              ) : null}
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={a.path.length >= 6}
            onClick={() =>
              onChange({
                ...a,
                path: [...a.path, a.path[a.path.length - 1] ?? { anchor: "basket" }],
              } as Action)
            }
          >
            <Plus className="size-3.5" aria-hidden />
            {t("addWaypoint")}
          </Button>
        </div>
      ) : null}

      {a.type === "screen" ? (
        <PositionPicker
          label={`${title}: ${t("target")}`}
          value={a.target}
          pack={pack}
          entities={diagram.entities}
          onChange={(target) => onChange({ ...a, target })}
        />
      ) : null}

      {a.type === "shot" ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-5 accent-accent"
              checked={!!a.to}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? { ...a, to: { anchor: "basket" } as Position }
                    : { id: a.id, step: a.step, type: "shot", entity: a.entity },
                )
              }
            />
            {t("aim")}
          </label>
          {a.to ? (
            <PositionPicker
              label={`${title}: ${t("target")}`}
              value={a.to}
              pack={pack}
              entities={diagram.entities}
              onChange={(to) => onChange({ ...a, to })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AnnotationRow({
  annotation: n,
  index,
  pack,
  entities,
  onChange,
  onRemove,
}: {
  annotation: Annotation;
  index: number;
  pack: Parameters<typeof PositionPicker>[0]["pack"];
  entities: Entity[];
  onChange: (n: Annotation) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("diagram.builder");
  const title = t(`annotationTypes.${n.type}`);
  const name = `${title} ${index + 1}`;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{name}</p>
        <RemoveButton label={t("removeItem", { name })} onClick={onRemove} />
      </div>

      {n.type === "text" ? (
        <>
          <label className="block text-xs text-ink-muted">
            {t("noteText")}
            <Input
              className={`${compact} mt-1`}
              maxLength={40}
              value={n.text}
              onChange={(e) => onChange({ ...n, text: e.target.value })}
            />
          </label>
          <PositionPicker
            label={`${name}: ${t("where")}`}
            value={n.at}
            pack={pack}
            entities={entities}
            onChange={(at) => onChange({ ...n, at })}
          />
        </>
      ) : null}

      {n.type === "zone_rect" ? (
        <>
          <label className="block text-xs text-ink-muted">
            {t("zoneLabel")}
            <Input
              className={`${compact} mt-1`}
              maxLength={24}
              value={n.label ?? ""}
              onChange={(e) => onChange({ ...n, label: e.target.value || undefined })}
            />
          </label>
          <PositionPicker
            label={`${name}: ${t("corner1")}`}
            value={n.from}
            pack={pack}
            entities={entities}
            onChange={(from) => onChange({ ...n, from })}
          />
          <PositionPicker
            label={`${name}: ${t("corner2")}`}
            value={n.to}
            pack={pack}
            entities={entities}
            onChange={(to) => onChange({ ...n, to })}
          />
        </>
      ) : null}

      {n.type === "zone_circle" ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
            <label className="block text-xs text-ink-muted">
              {t("zoneLabel")}
              <Input
                className={`${compact} mt-1`}
                maxLength={24}
                value={n.label ?? ""}
                onChange={(e) => onChange({ ...n, label: e.target.value || undefined })}
              />
            </label>
            <label className="block text-xs text-ink-muted">
              {t("radius")}
              <Input
                type="number"
                className={`${compact} mt-1`}
                min={0.5}
                max={10}
                step={0.5}
                value={n.radius}
                onChange={(e) =>
                  onChange({
                    ...n,
                    radius: Math.min(10, Math.max(0.5, Number(e.target.value) || 0.5)),
                  })
                }
              />
            </label>
          </div>
          <PositionPicker
            label={`${name}: ${t("center")}`}
            value={n.center}
            pack={pack}
            entities={entities}
            onChange={(center) => onChange({ ...n, center })}
          />
        </>
      ) : null}
    </div>
  );
}
