"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { HalfCourt } from "@/components/basketball";
import { FormError } from "@/components/features/auth/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { completeOnboardingAction, skipOnboardingAction } from "@/modules/identity/actions";
import {
  allAnswered,
  EMPTY_ANSWERS,
  Question,
  QUESTION_STEPS,
  stepIsAnswered,
  toPayload,
  type Answers,
  type QuestionStep,
} from "./question-fields";

/**
 * The basketball coaching onboarding: six interactive questions, one per screen, sliding in the direction the coach is
 * travelling, ending on an animated court and their own profile. Finishing saves the answers to the database (one
 * transaction with the timezone); "Skip for now" keeps a minimal profile and the dashboard keeps offering the rest.
 * The timezone is detected from the browser — the coach is never asked for it.
 */

const detectTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export function CoachOnboarding({ needsName }: { needsName: boolean }) {
  const t = useTranslations("onboarding.flow");
  const router = useRouter();
  const [step, setStep] = React.useState(0); // 0..5 = questions 1..6, 6 = ready
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");
  const [answers, setAnswers] = React.useState<Answers>(EMPTY_ANSWERS);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [skipping, startSkipping] = React.useTransition();
  const heading = React.useRef<HTMLHeadingElement>(null);
  const first = React.useRef(true);

  // move focus to the new question's title so keyboard and screen-reader users land on it
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const ready = step === QUESTION_STEPS.length;
  const question = (step + 1) as QuestionStep;
  const busy = pending || skipping;

  const go = (to: number) => {
    setDirection(to > step ? "forward" : "back");
    setError(null);
    setStep(to);
  };

  function finish() {
    if (!allAnswered(answers)) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeOnboardingAction({
          coaching: toPayload(answers),
          timezone: detectTimezone(),
          ...(needsName && name.trim() ? { name: name.trim() } : {}),
        });
        if (result && !result.ok) {
          setError(t("saveError"));
          return;
        }
        setDirection("forward");
        setStep(QUESTION_STEPS.length);
      } catch {
        setError(t("saveError"));
      }
    });
  }

  function skip() {
    setError(null);
    startSkipping(async () => {
      try {
        const result = await skipOnboardingAction({
          timezone: detectTimezone(),
          ...(needsName && name.trim() ? { name: name.trim() } : {}),
        });
        // a successful skip redirects to the dashboard; getting a result back means it did not
        if (result && !result.ok) setError(t("saveError"));
      } catch (e) {
        // Next's redirect() surfaces as a thrown control-flow error inside the action transition: let it through.
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError(t("saveError"));
      }
    });
  }

  if (ready)
    return (
      <Ready
        answers={answers}
        onEnter={() => {
          router.push("/dashboard");
          router.refresh();
        }}
      />
    );

  const isLast = question === 6;
  const canContinue = stepIsAnswered(question, answers);
  const number = String(step + 1).padStart(2, "0");

  return (
    <div className="w-full">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <p
            className="numeral text-lg whitespace-nowrap text-accent"
            aria-label={t("progressLabel", { step: step + 1 })}
          >
            {t("progress", { step: number })}
          </p>
          <div aria-hidden className="flex gap-1.5">
            {QUESTION_STEPS.map((s) => (
              <span
                key={s}
                className={cn(
                  "h-1 w-3.5 rounded-full smooth-colors min-[420px]:w-6 sm:w-9",
                  s <= question ? "bg-accent" : "bg-line-strong",
                )}
              />
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={skip}
          loading={skipping}
          disabled={pending}
        >
          {t("skip")}
        </Button>
      </div>

      <div key={step} className={direction === "forward" ? "step-forward" : "step-back"}>
        {step === 0 ? (
          <div className="mb-8 space-y-3">
            <p className="eyebrow text-accent">{t("intro")}</p>
            <h1 className="display text-4xl text-ink sm:text-5xl">{t("title")}</h1>
          </div>
        ) : null}
        <h2
          id="q-title"
          ref={heading}
          tabIndex={-1}
          className="mb-1.5 text-2xl font-semibold tracking-tight text-ink outline-none sm:text-[1.7rem]"
        >
          {t(`q${question}.title`)}
        </h2>
        {question !== 1 ? (
          <p className="mb-6 text-sm text-ink-muted">{t(`q${question}.hint` as "q2.hint")}</p>
        ) : (
          <div className="mb-6" />
        )}

        <Question step={question} answers={answers} onChange={setAnswers} labelledBy="q-title" />

        {isLast && needsName ? (
          <Field label={t("nameLabel")} hint={t("nameHint")} className="mt-6 max-w-sm">
            {(c) => (
              <Input
                {...c}
                value={name}
                maxLength={80}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
        ) : null}

        <FormError className="mt-6">{error}</FormError>

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => go(step - 1)}
            disabled={step === 0 || busy}
            className={step === 0 ? "invisible" : undefined}
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t("back")}
          </Button>
          {isLast ? (
            <Button
              type="button"
              size="lg"
              onClick={finish}
              loading={pending}
              disabled={!canContinue || skipping}
            >
              {pending ? t("saving") : t("finish")}
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              onClick={() => go(step + 1)}
              disabled={!canContinue || busy}
            >
              {t("next")}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
        {step === 0 ? <p className="mt-6 text-xs text-ink-muted">{t("skipNote")}</p> : null}
      </div>
    </div>
  );
}

/** "Your CoachOS is ready": the court draws itself and the coach sees their own profile — the answers they just saved. */
function Ready({ answers, onEnter }: { answers: Answers; onEnter: () => void }) {
  const t = useTranslations("onboarding.flow");
  const first = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    first.current?.focus();
  }, []);

  const chips: string[] = [
    t("ready.sport"),
    ...answers.ageGroups.map((k) => t(`q2.options.${k}.label`)),
    ...(answers.typicalPlayers ? [t("ready.players", { count: answers.typicalPlayers })] : []),
    ...(answers.experience ? [t(`q1.options.${answers.experience}.label`)] : []),
  ];
  const priorities = answers.priorities.slice(0, 5).map((k) => t(`q4.options.${k}.label`));

  return (
    <div className="relative w-full step-forward text-center">
      <HalfCourt
        animated
        className="mx-auto mb-6 h-40 w-auto text-ink/35 sm:h-52"
        strokeWidth={2.4}
      />
      <p className="eyebrow text-accent">{t("ready.eyebrow")}</p>
      <h1
        ref={first}
        tabIndex={-1}
        className="mt-2 display text-5xl text-ink outline-none sm:text-7xl"
      >
        {t("ready.title")}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-base text-ink-muted">{t("ready.subtitle")}</p>

      <ul
        className="mx-auto mt-7 flex max-w-xl flex-wrap justify-center gap-2"
        data-testid="ready-profile"
      >
        {chips.map((c, i) => (
          <li
            key={`${c}-${i}`}
            className="rise rounded-full border border-line-strong bg-surface-raised px-3.5 py-1.5 text-sm font-medium text-ink"
            style={{ "--rise-delay": `${400 + i * 70}ms` } as React.CSSProperties}
          >
            {c}
          </li>
        ))}
      </ul>
      {priorities.length > 0 ? (
        <p
          className="mx-auto mt-4 max-w-xl rise text-sm text-accent"
          style={{ "--rise-delay": `${400 + chips.length * 70}ms` } as React.CSSProperties}
        >
          {priorities.join(" • ")}
        </p>
      ) : null}

      <Button type="button" size="lg" className="mt-9" onClick={onEnter}>
        {t("ready.enter")}
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
