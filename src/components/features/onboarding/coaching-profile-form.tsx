"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { FormError } from "@/components/features/auth/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { saveCoachingProfileAction } from "@/modules/identity/actions";
import type { CoachingProfileDto } from "@/modules/identity/coaching-profile";
import {
  allAnswered,
  answersFromProfile,
  Question,
  QUESTION_STEPS,
  toPayload,
  type Answers,
  type QuestionStep,
} from "./question-fields";

const SECTION_KEY = {
  1: "experience",
  2: "ageGroups",
  3: "typicalPlayers",
  4: "priorities",
  5: "needs",
  6: "styles",
} as const satisfies Record<QuestionStep, string>;

/**
 * Settings → Coaching profile: the same six questions as onboarding (same controls, same meaning), all on one page. Saving
 * replaces the answers the dashboard recommendations and the AI Coach are personalised from.
 */
export function CoachingProfileForm({ initial }: { initial: CoachingProfileDto }) {
  const t = useTranslations("settings.coachingProfile");
  const tf = useTranslations("onboarding.flow");
  const { toast } = useToast();
  const [answers, setAnswers] = React.useState<Answers>(() => answersFromProfile(initial));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const complete = allAnswered(answers);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveCoachingProfileAction(toPayload(answers));
        if (result && !result.ok) setError(tf("saveError"));
        else toast(t("saved"), "success");
      } catch {
        setError(tf("saveError"));
      }
    });
  }

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      <p className="text-sm text-ink-muted">{t("aiNote")}</p>
      {QUESTION_STEPS.map((step) => (
        <Card key={step}>
          <CardHeader>
            <CardTitle>
              <span id={`cp-${step}`}>{t(`sections.${SECTION_KEY[step]}`)}</span>
            </CardTitle>
            <CardDescription>{tf(`q${step}.title`)}</CardDescription>
          </CardHeader>
          <CardBody>
            <Question
              step={step}
              answers={answers}
              onChange={setAnswers}
              labelledBy={`cp-${step}`}
            />
          </CardBody>
        </Card>
      ))}
      <Card>
        <CardFooter className="justify-between">
          <div className="min-w-0 flex-1">
            <FormError>{error}</FormError>
            {!complete ? <p className="text-sm text-ink-muted">{t("selectOne")}</p> : null}
          </div>
          <Button type="submit" loading={pending} disabled={!complete}>
            {t("save")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
