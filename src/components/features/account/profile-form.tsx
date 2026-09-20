"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CardBody, CardFooter } from "@/components/ui/card";
import type { Profession } from "@/db/enums";
import type { FormState } from "@/lib/result";
import { updateProfileAction } from "@/modules/identity/actions";
import {
  ActionError,
  failedValue,
  SaveButton,
  useActionFieldErrors,
  useSuccessToast,
} from "./form-feedback";
import { ProfileFields } from "./profile-fields";

export function ProfileForm({
  defaults,
  timezones,
}: {
  defaults: { name: string; profession: Profession | null; timezone: string | null };
  timezones: string[];
}) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfileAction, null);
  const errors = useActionFieldErrors(state);
  useSuccessToast(state, t("saved"));

  return (
    <form action={action} noValidate>
      <CardBody className="space-y-5">
        <ActionError state={state} />
        <ProfileFields
          defaults={{
            name: failedValue(state, "name") ?? defaults.name,
            profession:
              (failedValue(state, "profession") as Profession | undefined) ?? defaults.profession,
            timezone: failedValue(state, "timezone") ?? defaults.timezone,
          }}
          timezones={timezones}
          errors={errors}
        />
      </CardBody>
      <CardFooter>
        <SaveButton pending={pending} />
      </CardFooter>
    </form>
  );
}
