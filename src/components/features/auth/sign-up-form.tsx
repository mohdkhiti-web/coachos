"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/modules/identity/client";
import { authErrorKey } from "@/modules/identity/auth-errors";
import { fieldErrors, signUpSchema } from "@/modules/identity/validators";
import { FormError, PasswordInput, useFieldErrorTranslator, type FieldErrorMap } from "./shared";

export function SignUpForm() {
  const t = useTranslations("auth.signUp");
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
    const parsed = signUpSchema.safeParse({
      name: fd.get("name"),
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await authClient.signUp.email({
        ...parsed.data,
        callbackURL: "/verify-email",
      });
      if (error) {
        setFormError(te(authErrorKey(error)));
        setPending(false);
        return;
      }
      // Identical outcome whether or not the email already existed (no account enumeration).
      router.push(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
    } catch {
      setFormError(te("network"));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError>{formError}</FormError>
      <Field label={t("name")} errors={fe(errors, "name")}>
        {(c) => <Input {...c} name="name" autoComplete="name" required autoFocus />}
      </Field>
      <Field label={t("email")} errors={fe(errors, "email")}>
        {(c) => (
          <Input {...c} name="email" type="email" autoComplete="email" inputMode="email" required />
        )}
      </Field>
      <Field label={t("password")} hint={t("passwordHint")} errors={fe(errors, "password")}>
        {(c) => <PasswordInput {...c} name="password" autoComplete="new-password" required />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
