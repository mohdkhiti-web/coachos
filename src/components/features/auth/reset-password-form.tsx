"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/modules/identity/client";
import { authErrorKey } from "@/modules/identity/auth-errors";
import { fieldErrors, resetPasswordSchema } from "@/modules/identity/validators";
import { FormError, PasswordInput, useFieldErrorTranslator, type FieldErrorMap } from "./shared";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth.reset");
  const te = useTranslations("errors");
  const fe = useFieldErrorTranslator();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrorMap>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const parsed = resetPasswordSchema.safeParse({
      password: fd.get("password"),
      confirm: fd.get("confirm"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: parsed.data.password,
        token,
      });
      if (error) {
        setFormError(te(authErrorKey(error)));
        setPending(false);
        return;
      }
      router.replace("/sign-in?notice=reset");
    } catch {
      setFormError(te("network"));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError>{formError}</FormError>
      <Field label={t("password")} hint={t("passwordHint")} errors={fe(errors, "password")}>
        {(c) => (
          <PasswordInput {...c} name="password" autoComplete="new-password" required autoFocus />
        )}
      </Field>
      <Field label={t("confirm")} errors={fe(errors, "confirm")}>
        {(c) => <PasswordInput {...c} name="confirm" autoComplete="new-password" required />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
