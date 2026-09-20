"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/field";
import type { CourtPack, Position } from "@/engines/diagram";
import {
  anchorGroups,
  anchorText,
  entityName,
  modeOf,
  type Entity,
  type PositionMode,
} from "./model";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const compact = "h-10 px-2.5 text-sm";

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <Input
      type="number"
      aria-label={label}
      title={label}
      className={compact}
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) =>
        onChange(e.target.value === "" ? 0 : clamp(Number(e.target.value), min, max))
      }
    />
  );
}

/**
 * Where something sits on the court, in any of the three forms the diagram schema allows:
 * a NAMED court spot (+ optional offset in metres), absolute coordinates, or next to another player.
 * Named spots are the friendly default — no coordinates to remember.
 */
export function PositionPicker({
  label,
  value,
  onChange,
  pack,
  entities,
}: {
  label: string;
  value: Position;
  onChange: (p: Position) => void;
  pack: CourtPack;
  entities: Entity[];
}) {
  const t = useTranslations("diagram.builder");
  const mode = modeOf(value);
  const groups = anchorGroups(pack);
  const people = entities.filter((e) => e.type === "player" || e.type === "coach");
  const offset: [number, number] = "offset" in value && value.offset ? value.offset : [0, 0];
  const withOffset = (
    base: { anchor: string } | { entity: string },
    o: [number, number],
  ): Position => (o[0] === 0 && o[1] === 0 ? base : { ...base, offset: o });

  function changeMode(next: PositionMode) {
    if (next === mode) return;
    if (next === "anchor") onChange({ anchor: groups.near[0] ?? "basket" });
    else if (next === "xy") onChange({ x: 0, y: 6 });
    else onChange({ entity: people[0]?.id ?? entities[0]?.id ?? "" });
  }

  return (
    // Stacked (type on one row, value on the next): the builder column is narrow, and "top key" must stay readable.
    <fieldset className="grid gap-2">
      <legend className="sr-only">{label}</legend>
      <Select
        aria-label={`${label}: ${t("position.mode")}`}
        className={compact}
        value={mode}
        onChange={(e) => changeMode(e.target.value as PositionMode)}
      >
        <option value="anchor">{t("position.anchor")}</option>
        <option value="xy">{t("position.xy")}</option>
        <option value="entity" disabled={people.length === 0}>
          {t("position.entity")}
        </option>
      </Select>

      {"anchor" in value ? (
        <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-2">
          <Select
            aria-label={`${label}: ${t("position.spot")}`}
            className={compact}
            value={value.anchor}
            onChange={(e) => onChange(withOffset({ anchor: e.target.value }, offset))}
          >
            <optgroup label={t("position.thisEnd")}>
              {groups.near.map((a) => (
                <option key={a} value={a}>
                  {anchorText(a)}
                </option>
              ))}
            </optgroup>
            {groups.far.length > 0 ? (
              <optgroup label={t("position.farEnd")}>
                {groups.far.map((a) => (
                  <option key={a} value={a}>
                    {anchorText(a)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {!(value.anchor in pack.anchors) ? (
              <option value={value.anchor}>{anchorText(value.anchor)} ⚠</option>
            ) : null}
          </Select>
          <NumberField
            label={`${label}: ${t("position.offsetX")}`}
            value={offset[0]}
            min={-10}
            max={10}
            onChange={(n) => onChange(withOffset({ anchor: value.anchor }, [n, offset[1]]))}
          />
          <NumberField
            label={`${label}: ${t("position.offsetY")}`}
            value={offset[1]}
            min={-10}
            max={10}
            onChange={(n) => onChange(withOffset({ anchor: value.anchor }, [offset[0], n]))}
          />
        </div>
      ) : null}

      {"x" in value ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={`${label}: ${t("position.x")}`}
            value={value.x}
            min={-60}
            max={60}
            onChange={(n) => onChange({ x: n, y: value.y })}
          />
          <NumberField
            label={`${label}: ${t("position.y")}`}
            value={value.y}
            min={-60}
            max={60}
            onChange={(n) => onChange({ x: value.x, y: n })}
          />
        </div>
      ) : null}

      {"entity" in value ? (
        <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-2">
          <Select
            aria-label={`${label}: ${t("position.player")}`}
            className={compact}
            value={value.entity}
            onChange={(e) => onChange(withOffset({ entity: e.target.value }, offset))}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {entityName(p)}
              </option>
            ))}
          </Select>
          <NumberField
            label={`${label}: ${t("position.offsetX")}`}
            value={offset[0]}
            min={-10}
            max={10}
            onChange={(n) => onChange(withOffset({ entity: value.entity }, [n, offset[1]]))}
          />
          <NumberField
            label={`${label}: ${t("position.offsetY")}`}
            value={offset[1]}
            min={-10}
            max={10}
            onChange={(n) => onChange(withOffset({ entity: value.entity }, [offset[0], n]))}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
