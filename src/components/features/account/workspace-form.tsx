"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CardBody, CardFooter } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/result";
import { renameWorkspaceAction } from "@/modules/identity/actions";
import {
  ActionError,
  failedValue,
  SaveButton,
  useActionFieldErrors,
  useSuccessToast,
} from "./form-feedback";

export function WorkspaceForm({ name, canEdit }: { name: string; canEdit: boolean }) {
  const t = useTranslations("settings.profile");
  const ts = useTranslations("settings");
  const [state, action, pending] = useActionState<FormState, FormData>(renameWorkspaceAction, null);
  const errors = useActionFieldErrors(state);
  useSuccessToast(state, ts("saved"));

  return (
    <form action={action} noValidate>
      <CardBody className="space-y-4">
        <ActionError state={state} />
        <Field
          label={t("workspaceName")}
          hint={canEdit ? undefined : t("workspaceReadOnly")}
          errors={errors("workspaceName")}
        >
          {(c) => (
            <Input
              {...c}
              name="workspaceName"
              defaultValue={failedValue(state, "workspaceName") ?? name}
              disabled={!canEdit}
              required
            />
          )}
        </Field>
      </CardBody>
      {canEdit ? (
        <CardFooter>
          <SaveButton pending={pending} />
        </CardFooter>
      ) : null}
    </form>
  );
}
