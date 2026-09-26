"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  COACH_AGE_GROUPS,
  COACH_LIMITS,
  COACH_NEEDS,
  COACH_PRIORITIES,
  COACHING_EXPERIENCES,
  COACHING_STYLES,
  TEAM_SIZE_BANDS,
  type CoachAgeGroup,
  type CoachNeed,
  type CoachPriority,
  type CoachingExperience,
  type CoachingStyle,
} from "@/db/enums";
import { Field, Input } from "@/components/ui/field";
import type { CoachingProfileDto } from "@/modules/identity/coaching-profile";
import { ChoiceCard } from "./choice-card";

/**
 * The six coaching questions as controls. Used by BOTH the onboarding flow (one per screen) and Settings → Coaching
 * profile (all on one page), so an answer means exactly the same thing in both places. The parent owns the answers and
 * the headings; this owns how each question is answered.
 */

export type Answers = {
  experience: CoachingExperience | null;
  ageGroups: CoachAgeGroup[];
  typicalPlayers: number | null;
  priorities: CoachPriority[];
  needs: CoachNeed[];
  styles: CoachingStyle[];
};

export type QuestionStep = 1 | 2 | 3 | 4 | 5 | 6;
export const QUESTION_STEPS: readonly QuestionStep[] = [1, 2, 3, 4, 5, 6];

export const EMPTY_ANSWERS: Answers = {
  experience: null,
  ageGroups: [],
  typicalPlayers: null,
  priorities: [],
  needs: [],
  styles: [],
};

export const answersFromProfile = (p: CoachingProfileDto): Answers => ({
  experience: p.experience,
  ageGroups: p.ageGroups,
  typicalPlayers: p.typicalPlayers,
  priorities: p.priorities,
  needs: p.needs,
  styles: p.styles,
});

/** Can the coach move on from this question? (Every question needs an answer.) */
export function stepIsAnswered(step: QuestionStep, a: Answers): boolean {
  switch (step) {
    case 1:
      return a.experience !== null;
    case 2:
      return a.ageGroups.length > 0;
    case 3:
      return (
        a.typicalPlayers !== null &&
        Number.isInteger(a.typicalPlayers) &&
        a.typicalPlayers >= COACH_LIMITS.minPlayers &&
        a.typicalPlayers <= COACH_LIMITS.maxPlayers
      );
    case 4:
      return a.priorities.length > 0;
    case 5:
      return a.needs.length > 0;
    case 6:
      return a.styles.length > 0;
  }
}

export const allAnswered = (a: Answers) => QUESTION_STEPS.every((s) => stepIsAnswered(s, a));

/** The answers in the shape the server action validates (only call when `allAnswered`). */
export const toPayload = (a: Answers) => ({
  coachingExperience: a.experience,
  ageGroups: a.ageGroups,
  typicalPlayers: a.typicalPlayers,
  priorities: a.priorities,
  needs: a.needs,
  coachingStyles: a.styles,
});

/** Toggle one key in a multi-select, keeping the options' own order. */
function toggle<T extends string>(list: readonly T[], value: T, order: readonly T[]): T[] {
  return order.filter((k) => (k === value ? !list.includes(value) : list.includes(k)));
}

/** "All of the above" stands alone: choosing it clears the specifics, choosing a specific clears it. */
function toggleNeed(list: readonly CoachNeed[], value: CoachNeed): CoachNeed[] {
  if (value === "all") return list.includes("all") ? [] : ["all"];
  return toggle(
    list.filter((k) => k !== "all"),
    value,
    COACH_NEEDS,
  );
}

const COMING_SOON: readonly CoachNeed[] = ["team_management", "attendance"];

export function Question({
  step,
  answers,
  onChange,
  labelledBy,
}: {
  step: QuestionStep;
  answers: Answers;
  onChange: (next: Answers) => void;
  /** The id of the element that titles this question (the group is labelled by it). */
  labelledBy: string;
}) {
  const t = useTranslations("onboarding.flow");
  const set = (patch: Partial<Answers>) => onChange({ ...answers, ...patch });

  switch (step) {
    case 1:
      return (
        <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-3">
          {COACHING_EXPERIENCES.map((k) => (
            <ChoiceCard
              key={k}
              multiple={false}
              selected={answers.experience === k}
              onToggle={() => set({ experience: k })}
              label={t(`q1.options.${k}.label`)}
              hint={t(`q1.options.${k}.hint`)}
            />
          ))}
        </div>
      );
    case 2:
      return (
        <div
          role="group"
          aria-labelledby={labelledBy}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {COACH_AGE_GROUPS.map((k) => (
            <ChoiceCard
              key={k}
              compact
              multiple
              selected={answers.ageGroups.includes(k)}
              onToggle={() => set({ ageGroups: toggle(answers.ageGroups, k, COACH_AGE_GROUPS) })}
              label={t(`q2.options.${k}.label`)}
            />
          ))}
        </div>
      );
    case 3:
      return <TeamSize answers={answers} set={set} labelledBy={labelledBy} />;
    case 4:
      return (
        <div role="group" aria-labelledby={labelledBy} className="grid gap-3 sm:grid-cols-2">
          {COACH_PRIORITIES.map((k) => (
            <ChoiceCard
              key={k}
              compact
              multiple
              selected={answers.priorities.includes(k)}
              onToggle={() => set({ priorities: toggle(answers.priorities, k, COACH_PRIORITIES) })}
              label={t(`q4.options.${k}.label`)}
            />
          ))}
        </div>
      );
    case 5:
      return (
        <div role="group" aria-labelledby={labelledBy} className="grid gap-3 sm:grid-cols-2">
          {COACH_NEEDS.map((k) => (
            <ChoiceCard
              key={k}
              compact
              multiple
              selected={answers.needs.includes(k)}
              onToggle={() => set({ needs: toggleNeed(answers.needs, k) })}
              label={t(`q5.options.${k}.label`)}
              tag={COMING_SOON.includes(k) ? t("comingSoon") : undefined}
            />
          ))}
        </div>
      );
    case 6:
      return (
        <div role="group" aria-labelledby={labelledBy} className="grid gap-3 sm:grid-cols-2">
          {COACHING_STYLES.map((k) => (
            <ChoiceCard
              key={k}
              compact
              multiple
              selected={answers.styles.includes(k)}
              onToggle={() => set({ styles: toggle(answers.styles, k, COACHING_STYLES) })}
              label={t(`q6.options.${k}.label`)}
            />
          ))}
        </div>
      );
  }
}

function TeamSize({
  answers,
  set,
  labelledBy,
}: {
  answers: Answers;
  set: (patch: Partial<Answers>) => void;
  labelledBy: string;
}) {
  const t = useTranslations("onboarding.flow.q3");
  const tv = useTranslations("validation");
  // The exact-number box holds what the coach typed; a band button clears it. A typed number that matches a band's own
  // number still counts as "custom" (the box is showing), so the band is only lit when nothing was typed.
  const [typed, setTyped] = React.useState(() =>
    answers.typicalPlayers !== null &&
    !TEAM_SIZE_BANDS.some((b) => b.players === answers.typicalPlayers)
      ? String(answers.typicalPlayers)
      : "",
  );
  const typedNumber = /^\d{1,2}$/.test(typed) ? Number(typed) : null;
  const typedInvalid =
    typed !== "" &&
    (typedNumber === null ||
      typedNumber < COACH_LIMITS.minPlayers ||
      typedNumber > COACH_LIMITS.maxPlayers);

  return (
    <div className="space-y-5">
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        className="grid grid-cols-2 gap-3 sm:grid-cols-5"
      >
        {TEAM_SIZE_BANDS.map((b) => (
          <ChoiceCard
            key={b.key}
            compact
            multiple={false}
            selected={typed === "" && answers.typicalPlayers === b.players}
            onToggle={() => {
              setTyped("");
              set({ typicalPlayers: b.players });
            }}
            label={t(`bands.${b.key}`)}
          />
        ))}
      </div>
      <Field
        label={t("customLabel")}
        hint={t("customHint")}
        errors={typedInvalid ? [tv("range_invalid")] : undefined}
        className="max-w-xs"
      >
        {(c) => (
          <Input
            {...c}
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("custom")}
            value={typed}
            maxLength={2}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, "");
              setTyped(v);
              const n = /^\d{1,2}$/.test(v) ? Number(v) : null;
              set({
                typicalPlayers:
                  n !== null && n >= COACH_LIMITS.minPlayers && n <= COACH_LIMITS.maxPlayers
                    ? n
                    : null,
              });
            }}
          />
        )}
      </Field>
    </div>
  );
}
