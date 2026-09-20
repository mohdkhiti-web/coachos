"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/modules/identity/client";
import { authErrorKey, isEmailNotVerified } from "@/modules/identity/auth-errors";
import { fieldErrors, signInSchema } from "@/modules/identity/validators";
import {
  FormError,
  FormNotice,
  PasswordInput,
  useFieldErrorTranslator,
  type FieldErrorMap,
} from "./shared";

export function SignInForm({ next, notice }: { next: string; notice?: "reset" | "deleted" }) {
  const t = useTranslations("auth.signIn");
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
    const parsed = signInSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await authClient.signIn.email(parsed.data);
      if (error) {
        if (isEmailNotVerified(error)) {
          // Send a fresh link (with a callback that lands on /verify-email) and explain what to do.
          await authClient.sendVerificationEmail({
            email: parsed.data.email,
            callbackURL: "/verify-email",
          });
          router.push(`/verify-email?unverified=1&email=${encodeURIComponent(parsed.data.email)}`);
          return;
        }
        setFormError(te(authErrorKey(error)));
        setPending(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setFormError(te("network"));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {notice === "reset" ? <FormNotice>{t("resetDone")}</FormNotice> : null}
      {notice === "deleted" ? <FormNotice>{t("deleted")}</FormNotice> : null}
      <FormError>{formError}</FormError>
      <Field label={t("email")} errors={fe(errors, "email")}>
        {(c) => (
          <Input
            {...c}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            autoFocus
          />
        )}
      </Field>
      <Field label={t("password")} errors={fe(errors, "password")}>
        {(c) => <PasswordInput {...c} name="password" autoComplete="current-password" required />}
      </Field>
      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {t("forgot")}
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
