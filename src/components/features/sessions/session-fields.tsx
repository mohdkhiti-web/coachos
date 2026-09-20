"use client";

import { useTranslations } from "next-intl";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { LEVELS } from "@/db/enums";
import { errorsFor, type FieldErrors, type SessionFormValues } from "./session-model";
import { ObjectivePicker, type ObjectiveOption } from "./objective-picker";

export type AgeGroupOption = { key: string; name: string; ageMin: number; ageMax: number };

export type SessionCatalog = {
  ageGroups: AgeGroupOption[];
  objectives: ObjectiveOption[];
  timezones: string[];
};

/**
 * Every field of the session, in the order a coach thinks about it: what it is, when it is, where and who, what
 * it is for. One controlled set of inputs used by the "Create session" screen AND the builder's details panel, so
 * the two can never drift apart. Validation errors arrive as message keys and are translated here.
 */
export function SessionFields({
  values,
  onChange,
  errors,
  catalog,
  showVisibility,
  disabled,
  compact = false,
}: {
  values: SessionFormValues;
  onChange: (patch: Partial<SessionFormValues>) => void;
  errors?: FieldErrors;
  catalog: SessionCatalog;
  showVisibility: boolean;
  disabled?: boolean;
  /** The narrow side panel of the builder: one column, no descriptive text. */
  compact?: boolean;
}) {
  const t = useTranslations("sessions.form");
  const td = useTranslations("drills");
  const tv = useTranslations("validation");
  const text = (path: string): string[] | undefined => {
    const list = errorsFor(errors, path).map((k) => (tv.has(k) ? tv(k) : tv("invalid")));
    return list.length ? list : undefined;
  };
  const grid = compact ? "grid gap-4" : "grid gap-4 sm:grid-cols-2";
  const set =
    <K extends keyof SessionFormValues>(key: K) =>
    (value: SessionFormValues[K]) =>
      onChange({ [key]: value } as Partial<SessionFormValues>);

  return (
    <div className="space-y-8">
      <section aria-labelledby="sf-basics" className="space-y-4">
        <h3 id="sf-basics" className="eyebrow">
          {t("basics")}
        </h3>
        <Field label={t("title")} errors={text("title")}>
          {(c) => (
            <Input
              {...c}
              name="title"
              value={values.title}
              disabled={disabled}
              maxLength={120}
              placeholder={t("titlePlaceholder")}
              autoComplete="off"
              onChange={(e) => set("title")(e.target.value)}
            />
          )}
        </Field>
        <div className={grid}>
          <Field label={t("team")} errors={text("teamName")}>
            {(c) => (
              <Input
                {...c}
                name="teamName"
                value={values.teamName}
                disabled={disabled}
                maxLength={80}
                placeholder={t("teamPlaceholder")}
                autoComplete="off"
                onChange={(e) => set("teamName")(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("ageGroup")} errors={text("ageGroup")}>
            {(c) => (
              <Select
                {...c}
                name="ageGroup"
                value={values.ageGroup}
                disabled={disabled}
                onChange={(e) => set("ageGroup")(e.target.value)}
              >
                <option value="">{t("ageGroupNone")}</option>
                {catalog.ageGroups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.name} ({g.ageMin}–{g.ageMax})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("level")} errors={text("level")}>
            {(c) => (
              <Select
                {...c}
                name="level"
                value={values.level}
                disabled={disabled}
                onChange={(e) => set("level")(e.target.value)}
              >
                <option value="">{t("levelNone")}</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {td(`levels.${l}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("players")} errors={text("players")}>
            {(c) => (
              <Input
                {...c}
                name="players"
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                value={values.players}
                disabled={disabled}
                onChange={(e) => set("players")(e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t("duration")}
            errors={text("targetMinutes")}
            hint={compact ? undefined : t("durationHint")}
            className={compact ? undefined : "sm:col-span-2"}
          >
            {(c) => (
              <Input
                {...c}
                name="targetMinutes"
                type="number"
                inputMode="numeric"
                min={5}
                max={480}
                step={5}
                value={values.targetMinutes}
                disabled={disabled}
                onChange={(e) => set("targetMinutes")(e.target.value)}
              />
            )}
          </Field>
        </div>
      </section>

      <section aria-labelledby="sf-when" className="space-y-4">
        <h3 id="sf-when" className="eyebrow">
          {t("when")}
        </h3>
        <div className={compact ? "grid gap-4" : "grid gap-4 sm:grid-cols-3"}>
          <Field label={t("date")} errors={text("scheduledDate")}>
            {(c) => (
              <Input
                {...c}
                name="scheduledDate"
                type="date"
                value={values.scheduledDate}
                disabled={disabled}
                onChange={(e) => set("scheduledDate")(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("startTime")} errors={text("startTime")}>
            {(c) => (
              <Input
                {...c}
                name="startTime"
                type="time"
                value={values.startTime}
                disabled={disabled}
                onChange={(e) => set("startTime")(e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t("timezone")}
            errors={text("timezone")}
            hint={compact ? undefined : t("timezoneHint")}
          >
            {(c) => (
              <Select
                {...c}
                name="timezone"
                value={values.timezone}
                disabled={disabled}
                onChange={(e) => set("timezone")(e.target.value)}
              >
                {!catalog.timezones.includes(values.timezone) ? (
                  <option value={values.timezone}>{values.timezone || t("timezoneNone")}</option>
                ) : null}
                {catalog.timezones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </section>

      <section aria-labelledby="sf-where" className="space-y-4">
        <h3 id="sf-where" className="eyebrow">
          {t("where")}
        </h3>
        <div className={grid}>
          <Field label={t("location")} errors={text("location")}>
            {(c) => (
              <Input
                {...c}
                name="location"
                value={values.location}
                disabled={disabled}
                maxLength={120}
                placeholder={t("locationPlaceholder")}
                autoComplete="off"
                onChange={(e) => set("location")(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("coach")} errors={text("coachName")}>
            {(c) => (
              <Input
                {...c}
                name="coachName"
                value={values.coachName}
                disabled={disabled}
                maxLength={80}
                autoComplete="off"
                onChange={(e) => set("coachName")(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("club")} errors={text("clubName")}>
            {(c) => (
              <Input
                {...c}
                name="clubName"
                value={values.clubName}
                disabled={disabled}
                maxLength={120}
                placeholder={t("clubPlaceholder")}
                autoComplete="off"
                onChange={(e) => set("clubName")(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("season")} errors={text("season")}>
            {(c) => (
              <Input
                {...c}
                name="season"
                value={values.season}
                disabled={disabled}
                maxLength={40}
                placeholder={t("seasonPlaceholder")}
                autoComplete="off"
                onChange={(e) => set("season")(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("sessionNumber")} errors={text("sessionNumber")}>
            {(c) => (
              <Input
                {...c}
                name="sessionNumber"
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                value={values.sessionNumber}
                disabled={disabled}
                onChange={(e) => set("sessionNumber")(e.target.value)}
              />
            )}
          </Field>
        </div>
      </section>

      <section aria-labelledby="sf-objectives" className="space-y-4">
        <h3 id="sf-objectives" className="eyebrow">
          {t("objectives")}
        </h3>
        <ObjectivePicker
          objectives={catalog.objectives}
          primary={values.primaryObjective}
          secondary={values.secondaryObjectives}
          disabled={disabled}
          errors={{ primary: text("primaryObjective"), secondary: text("secondaryObjectives") }}
          onChange={(next) =>
            onChange({ primaryObjective: next.primary, secondaryObjectives: next.secondary })
          }
        />
      </section>

      <section aria-labelledby="sf-more" className="space-y-4">
        <h3 id="sf-more" className="eyebrow">
          {t("more")}
        </h3>
        <Field
          label={t("goal")}
          errors={text("objective")}
          hint={compact ? undefined : t("goalHint")}
        >
          {(c) => (
            <Textarea
              {...c}
              name="objective"
              rows={2}
              value={values.objective}
              disabled={disabled}
              maxLength={500}
              onChange={(e) => set("objective")(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t("notes")}
          errors={text("coachNotes")}
          hint={compact ? undefined : t("notesHint")}
        >
          {(c) => (
            <Textarea
              {...c}
              name="coachNotes"
              rows={3}
              value={values.coachNotes}
              disabled={disabled}
              maxLength={3000}
              onChange={(e) => set("coachNotes")(e.target.value)}
            />
          )}
        </Field>
        {showVisibility ? (
          <Field label={t("visibility")} hint={compact ? undefined : t("visibilityHint")}>
            {(c) => (
              <Select
                {...c}
                name="visibility"
                value={values.visibility}
                disabled={disabled}
                onChange={(e) =>
                  set("visibility")(e.target.value as SessionFormValues["visibility"])
                }
              >
                <option value="private">{t("visibilityPrivate")}</option>
                <option value="organization">{t("visibilityWorkspace")}</option>
              </Select>
            )}
          </Field>
        ) : null}
      </section>
    </div>
  );
}
