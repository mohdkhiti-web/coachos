"use client";

import * as React from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/modules/identity/client";
import { authErrorKey } from "@/modules/identity/auth-errors";
import { fieldErrors, forgotPasswordSchema } from "@/modules/identity/validators";
import { FormError, useFieldErrorTranslator, type FieldErrorMap } from "./shared";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot");
  const te = useTranslations("errors");
  const fe = useFieldErrorTranslator();
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrorMap>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const parsed = forgotPasswordSchema.safeParse({
      email: new FormData(e.currentTarget).get("email"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email: parsed.data.email,
        redirectTo: "/reset-password",
      });
      // Same message whether or not the account exists (no enumeration); only real failures show an error.
      if (error && (error.status === 429 || (error.status ?? 500) >= 500)) {
        setFormError(te(authErrorKey(error)));
        setPending(false);
        return;
      }
      setSent(true);
    } catch {
      setFormError(te("network"));
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <div className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <MailCheck className="size-6" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="display text-4xl text-ink">{t("sentTitle")}</h1>
          <p className="text-base text-ink-muted">{t("sentBody")}</p>
        </div>
        <Link
          href="/sign-in"
          className="inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {t("backToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="display text-4xl text-ink">{t("title")}</h1>
        <p className="text-base text-ink-muted">{t("subtitle")}</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError>{formError}</FormError>
        <Field label={t("email")} errors={fe(errors, "email")}>
          {(c) => (
            <Input
              {...c}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              autoFocus
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {t("submit")}
        </Button>
      </form>
      <Link
        href="/sign-in"
        className="inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        {t("backToSignIn")}
      </Link>
    </div>
  );
}
