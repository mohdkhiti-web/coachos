"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Profession } from "@/db/enums";
import type { FormState } from "@/lib/result";
import { completeOnboardingAction } from "@/modules/identity/actions";
import { ActionError, failedValue, useActionFieldErrors } from "./form-feedback";
import { ProfileFields } from "./profile-fields";

export function OnboardingForm({
  defaultName,
  timezones,
}: {
  defaultName: string;
  timezones: string[];
}) {
  const t = useTranslations("onboarding");
  const [state, action, pending] = useActionState<FormState, FormData>(
    completeOnboardingAction,
    null,
  );
  const errors = useActionFieldErrors(state);

  return (
    <form action={action} noValidate className="space-y-7">
      <ActionError state={state} />
      <ProfileFields
        defaults={{
          name: failedValue(state, "name") ?? defaultName,
          profession: (failedValue(state, "profession") as Profession | undefined) ?? null,
          timezone: failedValue(state, "timezone") ?? null,
        }}
        timezones={timezones}
        errors={errors}
        detectTimezone
        nameHint={t("nameHint")}
      />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
