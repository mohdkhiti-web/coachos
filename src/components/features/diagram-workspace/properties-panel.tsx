"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  CONE_VARIANTS,
  DEFEND_KINDS,
  DIAGRAM_COLORS,
  LIMITS,
  PASS_KINDS,
  SCREEN_KINDS,
  stepCountOf,
  type Diagram,
  type DiagramOp,
} from "@/engines/diagram";
import { cn } from "@/lib/cn";
import { isNothing, selectionSize, type Scene, type Selection } from "./workspace-model";

/**
 * The right panel: exactly what can be changed about what is selected, applied the moment it is changed (there is no Apply
 * button — every change is one undoable edit). Below it, a plain list of everything on the court, which is also the way to
 * pick an object without a mouse.
 */

export interface PropertiesProps {
  d: Diagram;
  scene: Scene;
  selection: Selection;
  step: number;
  disabled?: boolean;
  /** Apply operations (one undo step). Returns false when they were refused. */
  run: (
    ops: DiagramOp[],
    opts?: { say?: string; sound?: "duplicate" | "delete" | "select" | null },
  ) => boolean;
  onSelect: (s: Selection) => void;
  nameOf: (id: string) => string;
  /** The named spots of this court ("top key", "left wing"…), for placing an object exactly. */
  anchors: readonly string[];
  onDuplicate: () => void;
  onDelete: () => void;
}

const SIZES = [
  ["small", 0.75],
  ["medium", 1],
  ["large", 1.5],
  ["xlarge", 2],
] as const;

const round = (n: number) => Math.round(n * 100) / 100;

export function PropertiesPanel(props: PropertiesProps) {
  const { d, scene, selection, disabled, onSelect, nameOf } = props;
  const t = useTranslations("diagramWorkspace");
  const single = selectionSize(selection) === 1;
  const entity =
    single && selection.entities[0]
      ? d.entities.find((e) => e.id === selection.entities[0])
      : undefined;
  const action =
    single && selection.actions[0]
      ? d.actions.find((a) => a.id === selection.actions[0])
      : undefined;
  const noteIndex = single && selection.notes[0] !== undefined ? selection.notes[0] : undefined;
  const note = noteIndex !== undefined ? d.annotations[noteIndex] : undefined;

  return (
    <div className="flex flex-col gap-4" data-testid="properties-panel">
      <section aria-labelledby="props-heading" className="space-y-3">
        <h3 id="props-heading" className="eyebrow">
          {t("properties.title")}
        </h3>
        {isNothing(selection) ? (
          <NothingSelected {...props} />
        ) : entity ? (
          <EntityFields {...props} entityId={entity.id} />
        ) : action ? (
          <ActionFields {...props} actionId={action.id} />
        ) : note && noteIndex !== undefined ? (
          <NoteFields {...props} index={noteIndex} />
        ) : (
          <ManyFields {...props} />
        )}
      </section>

      <section aria-labelledby="objects-heading" className="space-y-2 border-t border-line pt-3">
        <h3 id="objects-heading" className="eyebrow">
          {t("objects.title")}
        </h3>
        {d.entities.length === 0 && d.actions.length === 0 && d.annotations.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("objects.empty")}</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1" data-testid="object-list">
            {scene.entities
              .filter((e) => !(e.entity.type === "ball" && e.entity.heldBy))
              .map((e) => {
                const on = selection.entities.includes(e.entity.id);
                return (
                  <li key={e.entity.id}>
                    <button
                      type="button"
                      data-testid="object-row"
                      aria-pressed={on}
                      disabled={disabled}
                      onClick={() => onSelect({ entities: [e.entity.id], actions: [], notes: [] })}
                      className={cn(
                        "flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm smooth-colors",
                        on ? "bg-accent-soft text-ink" : "text-ink hover:bg-surface-sunken",
                      )}
                    >
                      <span className="truncate">{nameOf(e.entity.id)}</span>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {t(`kinds.${e.entity.type === "player" ? e.entity.side : e.entity.type}`)}
                      </span>
                    </button>
                  </li>
                );
              })}
            {scene.actions.map((a) => {
              const action = d.actions.find((x) => x.id === a.id)!;
              const on = selection.actions.includes(a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    data-testid="action-row"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => onSelect({ entities: [], actions: [a.id], notes: [] })}
                    className={cn(
                      "flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm smooth-colors",
                      on ? "bg-accent-soft text-ink" : "text-ink hover:bg-surface-sunken",
                    )}
                  >
                    <span className="truncate">
                      {action.type === "pass"
                        ? t("objects.pass", { from: nameOf(action.from), to: nameOf(action.to) })
                        : t(`objects.${action.type}`, { who: nameOf(action.entity) })}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {t("objects.stepShort", { step: a.step })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function ColorSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string | undefined;
  onChange: (color: string | null) => void;
  disabled?: boolean;
  label: string;
}) {
  const t = useTranslations("diagramWorkspace");
  return (
    <Field label={label}>
      {(c) => (
        <Select
          {...c}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">{t("colors.default")}</option>
          {DIAGRAM_COLORS.map((color) => (
            <option key={color} value={color}>
              {t(`colors.${color}`)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function SizeSelect({
  value,
  onChange,
  disabled,
}: {
  value: number | undefined;
  onChange: (scale: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("diagramWorkspace");
  const current = value ?? 1;
  const known = SIZES.some(([, v]) => v === current);
  return (
    <Field label={t("properties.size")}>
      {(c) => (
        <Select
          {...c}
          value={String(current)}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {SIZES.map(([key, v]) => (
            <option key={key} value={v}>
              {t(`sizes.${key}`)}
            </option>
          ))}
          {known ? null : (
            <option value={current}>{t("sizes.custom", { scale: round(current) })}</option>
          )}
        </Select>
      )}
    </Field>
  );
}

function RotationField({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (deg: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("diagramWorkspace");
  return (
    <Field label={t("properties.rotation")}>
      {(c) => (
        <Input
          {...c}
          key={value}
          type="number"
          min={-180}
          max={180}
          step={15}
          defaultValue={value}
          disabled={disabled}
          onBlur={(e) => {
            const n = Math.round(Number(e.target.value));
            if (Number.isFinite(n) && n >= -180 && n <= 180 && n !== value) onChange(n);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      )}
    </Field>
  );
}

function Actions({
  onDuplicate,
  onDelete,
  disabled,
}: {
  onDuplicate?: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("diagramWorkspace");
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {onDuplicate ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={onDuplicate}
        >
          <Copy className="size-4" aria-hidden />
          {t("duplicate")}
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onDelete}>
        <Trash2 className="size-4" aria-hidden />
        {t("delete")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function NothingSelected({ d, run, disabled, step }: PropertiesProps) {
  const t = useTranslations("diagramWorkspace");
  const steps = stepCountOf(d);
  const title = d.stepTitles?.[String(step)] ?? "";
  const courtValue = d.court.variant.endsWith("_far") ? "half_far" : d.court.type;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">{t("properties.nothing")}</p>
      <Field label={t("court.label")}>
        {(c) => (
          <Select
            {...c}
            value={courtValue}
            disabled={disabled}
            onChange={(e) =>
              run([{ op: "set_court", court: e.target.value as "half" | "full" | "half_far" }], {
                say: t("announce.court"),
              })
            }
          >
            <option value="full">{t("court.full")}</option>
            <option value="half">{t("court.half")}</option>
            <option value="half_far">{t("court.halfFar")}</option>
          </Select>
        )}
      </Field>
      {steps > 1 || title ? (
        <Field label={t("properties.stepTitle", { step })}>
          {(c) => (
            <Input
              {...c}
              key={`${step}:${title}`}
              defaultValue={title}
              maxLength={LIMITS.stepTitle}
              disabled={disabled}
              placeholder={t("properties.stepTitlePlaceholder")}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== title)
                  run([{ op: "set_step_title", step, title: v ? v : null }], {
                    say: t("announce.stepRenamed"),
                  });
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          )}
        </Field>
      ) : null}
    </div>
  );
}

function EntityFields({
  d,
  scene,
  run,
  disabled,
  entityId,
  nameOf,
  anchors,
  onDuplicate,
  onDelete,
}: PropertiesProps & { entityId: string }) {
  const t = useTranslations("diagramWorkspace");
  const e = d.entities.find((x) => x.id === entityId);
  if (!e) return null;
  const scale = "scale" in e ? e.scale : undefined;
  const rotation = "rotation" in e && e.rotation ? e.rotation : 0;
  const color = "color" in e ? e.color : undefined;
  const heldBall = d.entities.find((x) => x.type === "ball" && x.heldBy === e.id);
  const isCarrierEntity = e.type === "player" || e.type === "coach";
  const carriers = d.entities.filter((x) => x.type === "player" || x.type === "coach");
  const where = scene.entities.find((x) => x.entity.id === e.id)?.at;

  const setLabel = (
    <Field label={e.type === "cone" ? t("properties.number") : t("properties.number")}>
      {(c) => (
        <Input
          {...c}
          key={`${e.id}:${"label" in e ? e.label : ""}`}
          defaultValue={"label" in e && e.label ? e.label : ""}
          maxLength={LIMITS.label}
          disabled={disabled}
          onBlur={(ev) => {
            const v = ev.target.value.trim();
            const current = "label" in e && e.label ? e.label : "";
            if (v && v !== current) run([{ op: "set_label", id: e.id, label: v }]);
          }}
          onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
        />
      )}
    </Field>
  );

  return (
    <div className="space-y-3" data-testid="entity-properties">
      <p className="text-sm font-medium text-ink" data-testid="selected-name">
        {nameOf(e.id)} · {t(`kinds.${e.type === "player" ? e.side : e.type}`)}
      </p>

      {e.type === "player" ? (
        <Field label={t("properties.type")}>
          {(c) => (
            <Select
              {...c}
              value={e.side}
              disabled={disabled}
              onChange={(ev) =>
                run([{ op: "set_side", id: e.id, side: ev.target.value as "offense" | "defense" }])
              }
            >
              <option value="offense">{t("kinds.offense")}</option>
              <option value="defense">{t("kinds.defense")}</option>
            </Select>
          )}
        </Field>
      ) : null}

      {e.type === "player" ||
      e.type === "coach" ||
      e.type === "cone" ||
      e.type === "equipment" ||
      e.type === "marker"
        ? setLabel
        : null}

      {isCarrierEntity ? (
        <Field label={t("properties.possession")}>
          {(c) => (
            <Select
              {...c}
              value={heldBall ? "ball" : "none"}
              disabled={disabled}
              onChange={(ev) => {
                if (ev.target.value === "ball") {
                  const free = d.entities.find((x) => x.type === "ball" && !x.heldBy);
                  const anyBall = free ?? d.entities.find((x) => x.type === "ball");
                  run(
                    anyBall
                      ? [{ op: "give_ball", ball: anyBall.id, to: e.id }]
                      : [{ op: "add_ball", heldBy: e.id }],
                  );
                } else if (heldBall) run([{ op: "release_ball", ball: heldBall.id }]);
              }}
            >
              <option value="none">{t("properties.noBall")}</option>
              <option value="ball">{t("properties.hasBall")}</option>
            </Select>
          )}
        </Field>
      ) : null}

      {e.type === "ball" ? (
        <Field label={t("properties.heldBy")}>
          {(c) => (
            <Select
              {...c}
              value={e.heldBy ?? ""}
              disabled={disabled}
              onChange={(ev) =>
                run(
                  ev.target.value
                    ? [{ op: "give_ball", ball: e.id, to: ev.target.value }]
                    : [{ op: "release_ball", ball: e.id }],
                )
              }
            >
              <option value="">{t("properties.loose")}</option>
              {carriers.map((p) => (
                <option key={p.id} value={p.id}>
                  {nameOf(p.id)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

      {e.type === "cone" ? (
        <Field label={t("properties.variant")}>
          {(c) => (
            <Select
              {...c}
              value={e.variant ?? "standard"}
              disabled={disabled}
              onChange={(ev) =>
                run([
                  {
                    op: "set_props",
                    ids: [e.id],
                    variant: ev.target.value as (typeof CONE_VARIANTS)[number],
                  },
                ])
              }
            >
              {CONE_VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {t(`variants.${v}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

      {e.type === "equipment" ? (
        <p className="text-sm text-ink-muted">{t(`equipment.${e.kind}`)}</p>
      ) : null}

      {e.type === "ball" && e.heldBy ? null : (
        <PositionFields
          key={`${e.id}:${where?.x}:${where?.y}`}
          x={where?.x ?? 0}
          y={where?.y ?? 0}
          anchors={anchors}
          disabled={disabled}
          onMove={(to) => run([{ op: "move", id: e.id, to }])}
        />
      )}
      <SizeSelect
        value={scale}
        disabled={disabled}
        onChange={(v) => run([{ op: "set_props", ids: [e.id], scale: v }])}
      />
      {e.type !== "ball" ? (
        <>
          <RotationField
            value={rotation}
            disabled={disabled}
            onChange={(deg) => run([{ op: "set_props", ids: [e.id], rotation: deg }])}
          />
          <ColorSelect
            label={t("properties.color")}
            value={color}
            disabled={disabled}
            onChange={(v) =>
              run([
                {
                  op: "set_props",
                  ids: [e.id],
                  color: v as (typeof DIAGRAM_COLORS)[number] | null,
                },
              ])
            }
          />
        </>
      ) : null}
      <Actions disabled={disabled} onDuplicate={onDuplicate} onDelete={onDelete} />
      <span className="sr-only">{scene.entities.length}</span>
    </div>
  );
}

function ActionFields({
  d,
  run,
  disabled,
  actionId,
  nameOf,
  onDelete,
}: PropertiesProps & { actionId: string }) {
  const t = useTranslations("diagramWorkspace");
  const a = d.actions.find((x) => x.id === actionId);
  if (!a) return null;
  const steps = stepCountOf(d);
  const kinds =
    a.type === "pass"
      ? PASS_KINDS
      : a.type === "screen"
        ? SCREEN_KINDS
        : a.type === "defend"
          ? DEFEND_KINDS
          : null;
  const curve = "curve" in a && a.curve ? a.curve : 0;
  return (
    <div className="space-y-3" data-testid="action-properties">
      <p className="text-sm font-medium text-ink">
        {a.type === "pass"
          ? t("objects.pass", { from: nameOf(a.from), to: nameOf(a.to) })
          : t(`objects.${a.type}`, { who: nameOf(a.entity) })}
      </p>
      <Field label={t("properties.actionStep")}>
        {(c) => (
          <Select
            {...c}
            value={a.step}
            disabled={disabled}
            onChange={(e) => run([{ op: "set_step", id: a.id, step: Number(e.target.value) }])}
          >
            {Array.from({ length: steps }, (_, i) => (
              <option key={i} value={i + 1}>
                {t("steps.step", { n: i + 1 })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {kinds ? (
        <Field label={t("properties.kind")}>
          {(c) => (
            <Select
              {...c}
              value={"kind" in a && a.kind ? a.kind : a.type === "pass" ? "standard" : ""}
              disabled={disabled}
              onChange={(e) => run([{ op: "set_action", id: a.id, kind: e.target.value }])}
            >
              {a.type === "screen" ? <option value="">{t("properties.plain")}</option> : null}
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {t(`actionKinds.${a.type}.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      <Field label={t("properties.curve")}>
        {(c) => (
          <input
            {...c}
            type="range"
            min={-1}
            max={1}
            step={0.1}
            value={curve}
            disabled={disabled}
            className="h-9 w-full accent-[var(--accent)]"
            onChange={(e) => run([{ op: "set_action", id: a.id, curve: Number(e.target.value) }])}
          />
        )}
      </Field>
      <Field label={t("properties.weight")}>
        {(c) => (
          <Select
            {...c}
            value={"weight" in a && a.weight ? a.weight : "normal"}
            disabled={disabled}
            onChange={(e) =>
              run([
                {
                  op: "set_action",
                  id: a.id,
                  weight: e.target.value as "thin" | "normal" | "thick",
                },
              ])
            }
          >
            <option value="thin">{t("weights.thin")}</option>
            <option value="normal">{t("weights.normal")}</option>
            <option value="thick">{t("weights.thick")}</option>
          </Select>
        )}
      </Field>
      <ColorSelect
        label={t("properties.color")}
        value={"color" in a ? a.color : undefined}
        disabled={disabled}
        onChange={(v) =>
          run([{ op: "set_action", id: a.id, color: v as (typeof DIAGRAM_COLORS)[number] | null }])
        }
      />
      <Actions disabled={disabled} onDelete={onDelete} />
    </div>
  );
}

function NoteFields({ d, run, disabled, index, onDelete }: PropertiesProps & { index: number }) {
  const t = useTranslations("diagramWorkspace");
  const n = d.annotations[index];
  if (!n) return null;
  return (
    <div className="space-y-3" data-testid="note-properties">
      <p className="text-sm font-medium text-ink">{t(`notes.${n.type}`)}</p>
      {n.type === "text" ? (
        <Field label={t("properties.text")}>
          {(c) => (
            <Input
              {...c}
              key={`${index}:${n.text}`}
              defaultValue={n.text}
              maxLength={LIMITS.text}
              disabled={disabled}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== n.text) run([{ op: "set_annotation", index, text: v }]);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          )}
        </Field>
      ) : null}
      {n.type === "zone_rect" || n.type === "zone_circle" ? (
        <Field label={t("properties.zoneLabel")}>
          {(c) => (
            <Input
              {...c}
              key={`${index}:${n.label ?? ""}`}
              defaultValue={n.label ?? ""}
              maxLength={LIMITS.zoneLabel}
              disabled={disabled}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (n.label ?? ""))
                  run([{ op: "set_annotation", index, label: v ? v : null }]);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          )}
        </Field>
      ) : null}
      <ColorSelect
        label={t("properties.color")}
        value={"color" in n ? n.color : undefined}
        disabled={disabled}
        onChange={(v) =>
          run([{ op: "set_annotation", index, color: v as (typeof DIAGRAM_COLORS)[number] | null }])
        }
      />
      <Actions disabled={disabled} onDelete={onDelete} />
    </div>
  );
}

function ManyFields({ selection, run, disabled, onDuplicate, onDelete }: PropertiesProps) {
  const t = useTranslations("diagramWorkspace");
  const ids = [...selection.entities];
  return (
    <div className="space-y-3" data-testid="multi-properties">
      <p className="text-sm font-medium text-ink" data-testid="selected-count">
        {t("properties.many", { count: selectionSize(selection) })}
      </p>
      {ids.length > 0 ? (
        <>
          <SizeSelect
            value={undefined}
            disabled={disabled}
            onChange={(v) => run([{ op: "set_props", ids, scale: v }])}
          />
          <RotationField
            value={0}
            disabled={disabled}
            onChange={(deg) => run([{ op: "set_props", ids, rotation: deg }])}
          />
          <ColorSelect
            label={t("properties.color")}
            value={undefined}
            disabled={disabled}
            onChange={(v) =>
              run([{ op: "set_props", ids, color: v as (typeof DIAGRAM_COLORS)[number] | null }])
            }
          />
        </>
      ) : null}
      <Actions
        disabled={disabled}
        onDuplicate={ids.length ? onDuplicate : undefined}
        onDelete={onDelete}
      />
    </div>
  );
}

/** Exact placement: metres across and along the court, or one of the court's named spots. */
function PositionFields({
  x,
  y,
  anchors,
  disabled,
  onMove,
}: {
  x: number;
  y: number;
  anchors: readonly string[];
  disabled?: boolean;
  onMove: (to: ({ x: number } & { y: number }) | { anchor: string }) => void;
}) {
  const t = useTranslations("diagramWorkspace");
  const commit = (form: HTMLElement | null) => {
    const fields = form?.closest("[data-position]");
    const nx = Number((fields?.querySelector("[name=x]") as HTMLInputElement | null)?.value);
    const ny = Number((fields?.querySelector("[name=y]") as HTMLInputElement | null)?.value);
    if (
      Number.isFinite(nx) &&
      Number.isFinite(ny) &&
      (round(nx) !== round(x) || round(ny) !== round(y))
    )
      onMove({ x: round(nx), y: round(ny) });
  };
  return (
    <fieldset className="space-y-2" data-position="">
      <legend className="text-sm font-medium text-ink">{t("properties.position")}</legend>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("properties.x")}>
          {(c) => (
            <Input
              {...c}
              name="x"
              type="number"
              step={0.1}
              defaultValue={round(x)}
              disabled={disabled}
              onBlur={(e) => commit(e.target)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          )}
        </Field>
        <Field label={t("properties.y")}>
          {(c) => (
            <Input
              {...c}
              name="y"
              type="number"
              step={0.1}
              defaultValue={round(y)}
              disabled={disabled}
              onBlur={(e) => commit(e.target)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          )}
        </Field>
      </div>
      <Field label={t("properties.spot")}>
        {(c) => (
          <Select
            {...c}
            value=""
            disabled={disabled}
            onChange={(e) => e.target.value && onMove({ anchor: e.target.value })}
          >
            <option value="">{t("properties.spotPlaceholder")}</option>
            {anchors.map((a) => (
              <option key={a} value={a}>
                {a.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </fieldset>
  );
}
