"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CardBody, CardFooter } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  ActionError,
  failedValue,
  SaveButton,
  useActionFieldErrors,
  useSuccessToast,
} from "@/components/features/account/form-feedback";
import type { FormState } from "@/lib/result";
import { saveTeamFormAction } from "@/modules/roster/actions";

type DoneState = FormState<{ id: string; version: number }>;

export function TeamForm({
  sports,
  defaultSport,
  defaults,
}: {
  /** Only needed to create: an existing team's sport cannot change. */
  sports?: readonly { key: string; name: string }[];
  /** Preselected sport for a new team: the one the coach is working in. */
  defaultSport?: string;
  defaults?: { id: string; version: number; name: string; notes: string };
}) {
  const t = useTranslations("roster");
  const router = useRouter();
  const [state, action, pending] = useActionState<DoneState, FormData>(saveTeamFormAction, null);
  const errors = useActionFieldErrors(state);
  useSuccessToast(state, t("teamSaved"));
  useEffect(() => {
    if (state?.ok && !defaults) router.push(`/roster/${state.data.id}`);
    else if (state?.ok) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} noValidate>
      <CardBody className="space-y-5">
        <ActionError state={state} />
        {defaults ? (
          <>
            <input type="hidden" name="id" value={defaults.id} />
            <input type="hidden" name="version" value={defaults.version} />
          </>
        ) : (
          <Field label={t("form.sport")} errors={errors("sportKey")}>
            {(c) => (
              <Select
                {...c}
                name="sportKey"
                defaultValue={failedValue(state, "sportKey") ?? defaultSport ?? ""}
                required
              >
                <option value="" disabled>
                  —
                </option>
                {sports?.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={t("form.name")} errors={errors("name")}>
          {(c) => (
            <Input
              {...c}
              name="name"
              defaultValue={failedValue(state, "name") ?? defaults?.name ?? ""}
              required
            />
          )}
        </Field>
        <Field label={t("form.notes")} hint={t("form.notesHint")} errors={errors("notes")}>
          {(c) => (
            <Textarea
              {...c}
              name="notes"
              defaultValue={failedValue(state, "notes") ?? defaults?.notes ?? ""}
            />
          )}
        </Field>
      </CardBody>
      <CardFooter>
        <SaveButton pending={pending} />
      </CardFooter>
    </form>
  );
}
