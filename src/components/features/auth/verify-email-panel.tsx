"use client";

import * as React from "react";
import Link from "next/link";
import { MailCheck, MailWarning } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/modules/identity/client";
import { authErrorKey } from "@/modules/identity/auth-errors";
import { emailSchema } from "@/modules/identity/validators";
import { FormError, FormNotice } from "./shared";

const COOLDOWN_SECONDS = 30;

export function VerifyEmailPanel({
  email,
  mode,
}: {
  email?: string;
  /** "sent" after sign-up · "unverified" after a sign-in attempt · "invalid" when the link failed */
  mode: "sent" | "unverified" | "invalid";
}) {
  const t = useTranslations("auth.verify");
  const te = useTranslations("errors");
  const tv = useTranslations("validation");
  const [address, setAddress] = React.useState(email ?? "");
  const [addressError, setAddressError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [resent, setResent] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(mode === "invalid" ? 0 : COOLDOWN_SECONDS);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const needsAddress = !email;

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setResent(false);
    const parsed = emailSchema.safeParse(address);
    if (!parsed.success) {
      setAddressError(tv("email_invalid"));
      return;
    }
    setAddressError(null);
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: parsed.data,
        callbackURL: "/verify-email",
      });
      if (error) {
        setFormError(te(authErrorKey(error)));
        return;
      }
      setResent(true);
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      setFormError(te("network"));
    }
  }

  const heading =
    mode === "invalid"
      ? t("invalidTitle")
      : mode === "unverified"
        ? t("unverifiedTitle")
        : t("title");
  const body =
    mode === "invalid"
      ? t("invalidBody")
      : mode === "unverified"
        ? email
          ? t("unverifiedBody", { email })
          : t("bodyNoEmail")
        : email
          ? t("body", { email })
          : t("bodyNoEmail");

  const Icon = mode === "invalid" ? MailWarning : MailCheck;

  return (
    <div className="space-y-6">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="display text-4xl text-ink">{heading}</h1>
        <p className="text-base text-ink-muted">{body}</p>
      </div>

      {resent ? <FormNotice>{t("resent")}</FormNotice> : null}
      <FormError>{formError}</FormError>

      <form onSubmit={resend} noValidate className="space-y-4">
        {needsAddress ? (
          <Field label={t("email")} errors={addressError ? [addressError] : undefined}>
            {(c) => (
              <Input
                {...c}
                type="email"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="email"
                inputMode="email"
                required
              />
            )}
          </Field>
        ) : mode !== "invalid" ? (
          <p className="text-sm text-ink-muted">{t("noEmail")}</p>
        ) : null}
        <Button type="submit" variant="secondary" disabled={cooldown > 0}>
          {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
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
