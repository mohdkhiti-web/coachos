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
import { savePlayerFormAction } from "@/modules/roster/actions";

type DoneState = FormState<{ id: string; version: number }>;

const CLASSIFICATIONS = Array.from({ length: 8 }, (_, i) => (1 + i * 0.5).toFixed(1));

export function PlayerForm({
  teams,
  defaultTeamId,
  defaults,
  onSaved,
}: {
  teams: readonly { id: string; name: string }[];
  defaultTeamId?: string;
  defaults?: {
    id: string;
    version: number;
    name: string;
    teamId: string | null;
    dateOfBirth: string | null;
    classification: number | null;
    notes: string;
  };
  /** Called after a successful save (the caller decides what "done" means — close a panel, refresh a list, …). */
  onSaved?: () => void;
}) {
  const t = useTranslations("roster");
  const router = useRouter();
  const [state, action, pending] = useActionState<DoneState, FormData>(savePlayerFormAction, null);
  const errors = useActionFieldErrors(state);
  useSuccessToast(state, t("playerSaved"));
  useEffect(() => {
    if (!state?.ok) return;
    if (defaults) {
      router.refresh();
      onSaved?.();
    } else {
      router.push(defaultTeamId ? `/roster/${defaultTeamId}` : "/roster");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} noValidate>
      <CardBody className="space-y-5">
        <ActionError state={state} />
        {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
        {defaults ? <input type="hidden" name="version" value={defaults.version} /> : null}
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
        <Field label={t("form.team")} errors={errors("teamId")}>
          {(c) => (
            <Select
              {...c}
              name="teamId"
              defaultValue={failedValue(state, "teamId") ?? defaults?.teamId ?? defaultTeamId ?? ""}
            >
              <option value="">{t("form.unassigned")}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("form.dateOfBirth")} errors={errors("dateOfBirth")}>
          {(c) => (
            <Input
              {...c}
              type="date"
              name="dateOfBirth"
              defaultValue={failedValue(state, "dateOfBirth") ?? defaults?.dateOfBirth ?? ""}
            />
          )}
        </Field>
        <Field
          label={t("form.classification")}
          hint={t("form.classificationHint")}
          errors={errors("classification")}
        >
          {(c) => (
            <Select
              {...c}
              name="classification"
              defaultValue={
                failedValue(state, "classification") ?? defaults?.classification?.toFixed(1) ?? ""
              }
            >
              <option value="">{t("form.classificationNone")}</option>
              {CLASSIFICATIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("form.notes")} errors={errors("notes")}>
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
