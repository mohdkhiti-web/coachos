"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CardBody, CardFooter } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { UNITS, type Units } from "@/db/enums";
import type { FormState } from "@/lib/result";
import { updatePreferencesAction } from "@/modules/identity/actions";
import {
  ActionError,
  failedValue,
  SaveButton,
  useActionFieldErrors,
  useSuccessToast,
} from "./form-feedback";

export function PreferencesForm({ units }: { units: Units }) {
  const t = useTranslations("settings.preferences");
  const ts = useTranslations("settings");
  const [state, action, pending] = useActionState<FormState, FormData>(
    updatePreferencesAction,
    null,
  );
  const errors = useActionFieldErrors(state);
  useSuccessToast(state, ts("saved"));

  return (
    <form action={action} noValidate>
      <CardBody className="space-y-4">
        <ActionError state={state} />
        <Field label={t("units")} errors={errors("units")}>
          {(c) => (
            <Select
              {...c}
              name="units"
              defaultValue={failedValue(state, "units") ?? units}
              className="max-w-xs"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(u)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </CardBody>
      <CardFooter>
        <SaveButton pending={pending} />
      </CardFooter>
    </form>
  );
}
