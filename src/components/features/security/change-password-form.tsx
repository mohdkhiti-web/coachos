"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CardBody, CardFooter } from "@/components/ui/card";
import { Checkbox, Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  FormError,
  PasswordInput,
  useFieldErrorTranslator,
  type FieldErrorMap,
} from "@/components/features/auth/shared";
import { authClient } from "@/modules/identity/client";
import { authErrorKey } from "@/modules/identity/auth-errors";
import { changePasswordSchema, fieldErrors } from "@/modules/identity/validators";

export function ChangePasswordForm() {
  const t = useTranslations("settings.security");
  const te = useTranslations("errors");
  const fe = useFieldErrorTranslator();
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrorMap>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const parsed = changePasswordSchema.safeParse({
      currentPassword: fd.get("currentPassword"),
      newPassword: fd.get("newPassword"),
      confirm: fd.get("confirm"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: fd.get("revokeOthers") === "on",
      });
      if (error) {
        setFormError(te(authErrorKey(error)));
        return;
      }
      formRef.current?.reset();
      toast(t("passwordChanged"), "success");
    } catch {
      setFormError(te("network"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      <CardBody className="space-y-5">
        <FormError>{formError}</FormError>
        <Field label={t("currentPassword")} errors={fe(errors, "currentPassword")}>
          {(c) => (
            <PasswordInput {...c} name="currentPassword" autoComplete="current-password" required />
          )}
        </Field>
        <Field label={t("newPassword")} errors={fe(errors, "newPassword")}>
          {(c) => <PasswordInput {...c} name="newPassword" autoComplete="new-password" required />}
        </Field>
        <Field label={t("confirmPassword")} errors={fe(errors, "confirm")}>
          {(c) => <PasswordInput {...c} name="confirm" autoComplete="new-password" required />}
        </Field>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-ink">
          <Checkbox name="revokeOthers" defaultChecked />
          {t("signOutOthers")}
        </label>
      </CardBody>
      <CardFooter>
        <Button type="submit" loading={pending}>
          {t("changePassword")}
        </Button>
      </CardFooter>
    </form>
  );
}
