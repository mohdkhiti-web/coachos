"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormError } from "@/components/features/auth/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { SectionMarker } from "@/components/ui/section-marker";
import { useToast } from "@/components/ui/toast";
import { EQUIPMENT_RULES, LEVELS, SOURCE_KINDS } from "@/db/enums";
import { createDrillAction, updateDrillAction } from "@/modules/drills/actions";
import { DiagramBuilder } from "./diagram-builder/diagram-builder";
import { errorsFor, type DrillFormValues } from "./form-model";
import { toPayload } from "./form-model";

type Option = { key: string; name: string };

/**
 * Create / edit a drill. One controlled form; the Server Action validates everything again (Zod +
 * the sport's own catalog and diagram rules) and is the only thing that writes to the database.
 * Field errors come back keyed by path and are shown next to the field they belong to.
 */
export function DrillForm({
  mode,
  sportKey,
  categories,
  skills,
  equipment,
  spaces,
  showVisibility,
  initial,
  drillId,
  version,
  cancelHref,
}: {
  mode: "create" | "edit";
  sportKey: string;
  categories: Option[];
  skills: Option[];
  equipment: Option[];
  spaces: string[];
  showVisibility: boolean;
  initial: DrillFormValues;
  drillId?: string;
  version?: number;
  cancelHref: string;
}) {
  const t = useTranslations("drills.form");
  const tv = useTranslations("validation");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const tl = useTranslations("drills");
  const router = useRouter();
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [v, setV] = React.useState<DrillFormValues>(initial);
  const [fields, setFields] = React.useState<Record<string, string[]> | undefined>();
  const [failure, setFailure] = React.useState<string | null>(null);
  const [focusTick, setFocusTick] = React.useState(0);
  const [pending, startTransition] = React.useTransition();

  const set = <K extends keyof DrillFormValues>(key: K, value: DrillFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));
  const text = (path: string): string[] | undefined => {
    const list = errorsFor(fields, path).map((k) => (tv.has(k) ? tv(k) : tv("invalid")));
    return list.length ? list : undefined;
  };

  // After a failed save, move focus to the first invalid control so keyboard and screen-reader users land on it.
  React.useEffect(() => {
    if (focusTick === 0) return;
    const el = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"], [data-invalid="true"]',
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  }, [focusTick]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFailure(null);
    startTransition(async () => {
      const payload = toPayload(v, version);
      const result =
        mode === "create"
          ? await createDrillAction(sportKey, payload)
          : await updateDrillAction(sportKey, drillId!, payload);
      if (result?.ok) {
        toast(mode === "create" ? t("created") : t("saved"), "success");
        router.push(`/sports/${sportKey}/drills/${result.data.id}`);
        router.refresh();
        return;
      }
      const code = result && !result.ok ? result.error.code : "INTERNAL";
      setFields(result && !result.ok ? result.error.fields : undefined);
      setFailure(code);
      setFocusTick((n) => n + 1);
    });
  }

  const failureText =
    failure === "VALIDATION"
      ? t("fixErrors")
      : failure === "CONFLICT"
        ? t("conflict")
        : failure
          ? te.has(failure)
            ? te(failure)
            : te("generic")
          : null;

  const range = (
    label: string,
    minKey: keyof DrillFormValues,
    maxKey: keyof DrillFormValues,
    unit: string,
  ) => (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-ink">
        {label} <span className="font-normal text-ink-muted">({unit})</span>
      </legend>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("min")} errors={text(minKey)}>
          {(c) => (
            <Input
              {...c}
              type="number"
              inputMode="numeric"
              value={v[minKey] as string}
              onChange={(e) => set(minKey, e.target.value as never)}
            />
          )}
        </Field>
        <Field label={t("max")} errors={text(maxKey)}>
          {(c) => (
            <Input
              {...c}
              type="number"
              inputMode="numeric"
              value={v[maxKey] as string}
              onChange={(e) => set(maxKey, e.target.value as never)}
            />
          )}
        </Field>
      </div>
    </fieldset>
  );

  const lines = (
    key: keyof DrillFormValues,
    path: string,
    label: string,
    hint?: string,
    rows = 4,
    required = false,
  ) => (
    <Field label={label} hint={hint ?? t("onePerLine")} errors={text(path)}>
      {(c) => (
        <Textarea
          {...c}
          rows={rows}
          required={required}
          value={v[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
        />
      )}
    </Field>
  );

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="space-y-8"
      aria-label={mode === "create" ? t("createTitle") : t("editTitle")}
    >
      {failureText ? (
        <div data-invalid="true" tabIndex={-1}>
          <FormError>{failureText}</FormError>
        </div>
      ) : null}

      {/* 01 — basics */}
      <Card>
        <CardBody className="space-y-5">
          <SectionMarker as="h2" n={1}>
            {t("basics")}
          </SectionMarker>
          <Field label={t("title")} errors={text("title")}>
            {(c) => (
              <Input
                {...c}
                required
                maxLength={120}
                value={v.title}
                onChange={(e) => set("title", e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t("description")}
            hint={t("descriptionHint", { count: v.description.trim().length })}
            errors={text("description")}
          >
            {(c) => (
              <Textarea
                {...c}
                required
                rows={3}
                maxLength={300}
                value={v.description}
                onChange={(e) => set("description", e.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label={t("category")} errors={text("category")}>
              {(c) => (
                <Select
                  {...c}
                  required
                  value={v.category}
                  onChange={(e) => set("category", e.target.value)}
                >
                  <option value="" disabled>
                    {t("choose")}
                  </option>
                  {categories.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("level")} errors={text("level")}>
              {(c) => (
                <Select
                  {...c}
                  required
                  value={v.level}
                  onChange={(e) => set("level", e.target.value as never)}
                >
                  <option value="" disabled>
                    {t("choose")}
                  </option>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {tl(`levels.${l}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("space")} errors={text("space")}>
              {(c) => (
                <Select
                  {...c}
                  required
                  value={v.space}
                  onChange={(e) => set("space", e.target.value)}
                >
                  {spaces.map((s) => (
                    <option key={s} value={s}>
                      {tl(`spaces.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* 02 — who and how long */}
      <Card>
        <CardBody className="space-y-5">
          <SectionMarker as="h2" n={2}>
            {t("who")}
          </SectionMarker>
          <div className="grid gap-6 md:grid-cols-3">
            {range(t("age"), "ageMin", "ageMax", t("years"))}
            {range(t("players"), "playersMin", "playersMax", t("people"))}
            {range(t("duration"), "durationMin", "durationMax", t("minutes"))}
          </div>
        </CardBody>
      </Card>

      {/* 03 — skills */}
      <Card>
        <CardBody className="space-y-5">
          <SectionMarker as="h2" n={3}>
            {t("skills")}
          </SectionMarker>
          <Field label={t("primarySkill")} errors={text("primarySkill")}>
            {(c) => (
              <Select
                {...c}
                required
                className="sm:max-w-sm"
                value={v.primarySkill}
                onChange={(e) => set("primarySkill", e.target.value)}
              >
                <option value="" disabled>
                  {t("choose")}
                </option>
                {skills.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <fieldset className="space-y-2" aria-describedby="secondary-hint">
            <legend className="text-sm font-medium text-ink">{t("secondarySkills")}</legend>
            <p id="secondary-hint" className="text-sm text-ink-muted">
              {t("secondaryHint")}
            </p>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {skills
                .filter((s) => s.key !== v.primarySkill)
                .map((s) => {
                  const checked = v.secondarySkills.includes(s.key);
                  return (
                    <label
                      key={s.key}
                      className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-ink"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!checked && v.secondarySkills.length >= 3}
                        onChange={(e) =>
                          set(
                            "secondarySkills",
                            e.target.checked
                              ? [...v.secondarySkills, s.key]
                              : v.secondarySkills.filter((k) => k !== s.key),
                          )
                        }
                      />
                      {s.name}
                    </label>
                  );
                })}
            </div>
            {text("secondarySkills") ? (
              <p
                role="alert"
                data-invalid="true"
                tabIndex={-1}
                className="text-sm font-medium text-danger"
              >
                {text("secondarySkills")!.join(" ")}
              </p>
            ) : null}
          </fieldset>
          <Field label={t("tags")} hint={t("tagsHint")} errors={text("tags")}>
            {(c) => <Input {...c} value={v.tags} onChange={(e) => set("tags", e.target.value)} />}
          </Field>
        </CardBody>
      </Card>

      {/* 04 — coaching content */}
      <Card>
        <CardBody className="space-y-5">
          <SectionMarker as="h2" n={4}>
            {t("content")}
          </SectionMarker>
          <Field label={t("objective")} errors={text("content.objective")}>
            {(c) => (
              <Textarea
                {...c}
                required
                rows={2}
                value={v.objective}
                onChange={(e) => set("objective", e.target.value)}
              />
            )}
          </Field>
          <Field label={t("setup")} errors={text("content.setup")}>
            {(c) => (
              <Textarea
                {...c}
                required
                rows={3}
                value={v.setup}
                onChange={(e) => set("setup", e.target.value)}
              />
            )}
          </Field>
          {lines(
            "instructions",
            "content.instructions",
            t("instructions"),
            t("stepsHint"),
            6,
            true,
          )}
          {lines(
            "coachingPoints",
            "content.coachingPoints",
            t("coachingPoints"),
            undefined,
            4,
            true,
          )}
          {lines("commonMistakes", "content.commonMistakes", t("commonMistakes"))}
          <Field label={t("safety")} errors={text("content.safety")}>
            {(c) => (
              <Textarea
                {...c}
                rows={2}
                value={v.safety}
                onChange={(e) => set("safety", e.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-5 md:grid-cols-3">
            {lines("progressions", "content.progressions", t("progressions"), undefined, 3)}
            {lines("regressions", "content.regressions", t("regressions"), undefined, 3)}
            {lines("variations", "content.variations", t("variations"), undefined, 3)}
          </div>
        </CardBody>
      </Card>

      {/* 05 — equipment */}
      <Card>
        <CardBody className="space-y-4">
          <SectionMarker as="h2" n={5}>
            {t("equipment")}
          </SectionMarker>
          <p className="text-sm text-ink-muted">{t("equipmentHint")}</p>
          <ul className="divide-y divide-line rounded-md border border-line">
            {equipment.map((e) => {
              const row = v.equipment[e.key] ?? {
                on: false,
                rule: "fixed" as const,
                quantity: "1",
              };
              const upd = (patch: Partial<typeof row>) =>
                set("equipment", { ...v.equipment, [e.key]: { ...row, ...patch } });
              return (
                <li key={e.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                  <label className="flex min-w-40 flex-1 cursor-pointer items-center gap-3 text-sm font-medium text-ink">
                    <Checkbox checked={row.on} onChange={(ev) => upd({ on: ev.target.checked })} />
                    {e.name}
                  </label>
                  {row.on ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={60}
                        className="h-10 w-20 px-2.5 text-sm"
                        aria-label={`${e.name}: ${t("quantity")}`}
                        value={row.quantity}
                        onChange={(ev) => upd({ quantity: ev.target.value })}
                      />
                      <Select
                        className="h-10 px-2.5 text-sm"
                        aria-label={`${e.name}: ${t("rule")}`}
                        value={row.rule}
                        onChange={(ev) => upd({ rule: ev.target.value as never })}
                      >
                        {EQUIPMENT_RULES.map((r) => (
                          <option key={r} value={r}>
                            {t(`rules.${r}`)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {text("equipment") ? (
            <p
              role="alert"
              data-invalid="true"
              tabIndex={-1}
              className="text-sm font-medium text-danger"
            >
              {text("equipment")!.join(" ")}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* 06 — diagrams */}
      <Card>
        <CardBody className="space-y-4">
          <SectionMarker as="h2" n={6}>
            {t("diagrams")}
          </SectionMarker>
          <p className="text-sm text-ink-muted">{t("diagramsHint")}</p>
          <DiagramBuilder
            sportKey={sportKey}
            value={v.diagrams}
            onChange={(d) => set("diagrams", d)}
            serverErrors={fields}
          />
        </CardBody>
      </Card>

      {/* 07 — resources & source & sharing */}
      <Card>
        <CardBody className="space-y-5">
          <SectionMarker as="h2" n={7}>
            {t("sourceAndSharing")}
          </SectionMarker>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-ink">{t("resources")}</legend>
            <p className="text-sm text-ink-muted">{t("resourcesHint")}</p>
            {v.resources.map((r, i) => (
              <div
                key={i}
                className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-start"
              >
                <Field label={t("resourceKind")}>
                  {(c) => (
                    <Select
                      {...c}
                      value={r.kind}
                      onChange={(e) =>
                        set(
                          "resources",
                          v.resources.map((x, j) =>
                            j === i ? { ...x, kind: e.target.value as "video" | "article" } : x,
                          ),
                        )
                      }
                    >
                      <option value="video">{t("kindVideo")}</option>
                      <option value="article">{t("kindArticle")}</option>
                    </Select>
                  )}
                </Field>
                <Field label={t("resourceTitle")} errors={text(`content.resources.${i}.title`)}>
                  {(c) => (
                    <Input
                      {...c}
                      maxLength={80}
                      value={r.title}
                      onChange={(e) =>
                        set(
                          "resources",
                          v.resources.map((x, j) =>
                            j === i ? { ...x, title: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  )}
                </Field>
                <Field label={t("resourceUrl")} errors={text(`content.resources.${i}.url`)}>
                  {(c) => (
                    <Input
                      {...c}
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={r.url}
                      onChange={(e) =>
                        set(
                          "resources",
                          v.resources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                        )
                      }
                    />
                  )}
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="sm:mt-6"
                  aria-label={t("removeResource", { n: i + 1 })}
                  onClick={() =>
                    set(
                      "resources",
                      v.resources.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={v.resources.length >= 3}
              onClick={() =>
                set("resources", [...v.resources, { kind: "video", title: "", url: "" }])
              }
            >
              <Plus className="size-3.5" aria-hidden />
              {t("addResource")}
            </Button>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label={t("sourceKind")} errors={text("sourceKind")}>
              {(c) => (
                <Select
                  {...c}
                  value={v.sourceKind}
                  onChange={(e) => set("sourceKind", e.target.value as never)}
                >
                  {SOURCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`sourceKinds.${k}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {v.sourceKind !== "original" ? (
              <>
                <Field label={t("sourceName")} errors={text("sourceName")}>
                  {(c) => (
                    <Input
                      {...c}
                      maxLength={120}
                      value={v.sourceName}
                      onChange={(e) => set("sourceName", e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t("sourceUrl")} errors={text("sourceUrl")}>
                  {(c) => (
                    <Input
                      {...c}
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={v.sourceUrl}
                      onChange={(e) => set("sourceUrl", e.target.value)}
                    />
                  )}
                </Field>
              </>
            ) : null}
          </div>

          {showVisibility ? (
            <Field
              label={t("visibility")}
              hint={t("visibilityHint")}
              errors={text("visibility")}
              className="sm:max-w-sm"
            >
              {(c) => (
                <Select
                  {...c}
                  value={v.visibility}
                  onChange={(e) => set("visibility", e.target.value as never)}
                >
                  <option value="private">{t("visibilityPrivate")}</option>
                  <option value="organization">{t("visibilityOrganization")}</option>
                </Select>
              )}
            </Field>
          ) : (
            <p className="text-sm text-ink-muted">{t("privateNote")}</p>
          )}
        </CardBody>
      </Card>

      {/* sticky save bar: above the mobile tab bar, at the bottom on desktop */}
      <div className="sticky bottom-[4.75rem] z-20 flex flex-wrap items-center justify-end gap-3 rounded-lg border border-line bg-surface-raised/95 p-3 shadow-paper backdrop-blur md:bottom-3">
        {failureText ? (
          <p role="status" className="mr-auto text-sm font-medium text-danger">
            {failureText}
          </p>
        ) : null}
        <Button asChild variant="secondary">
          <Link href={cancelHref}>{tc("cancel")}</Link>
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? tc("saving") : mode === "create" ? t("create") : t("save")}
        </Button>
      </div>
    </form>
  );
}
