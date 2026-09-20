"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CardBody, CardFooter } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  FormError,
  FormNotice,
  useFieldErrorTranslator,
  type FieldErrorMap,
} from "@/components/features/auth/shared";
import { authClient } from "@/modules/identity/client";
import { authErrorKey } from "@/modules/identity/auth-errors";
import { changeEmailSchema, fieldErrors } from "@/modules/identity/validators";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations("settings.security");
  const te = useTranslations("errors");
  const fe = useFieldErrorTranslator();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrorMap>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSent(false);
    const parsed = changeEmailSchema.safeParse({
      newEmail: new FormData(e.currentTarget).get("newEmail"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await authClient.changeEmail({
        newEmail: parsed.data.newEmail,
        callbackURL: "/settings/security",
      });
      if (error) {
        setFormError(te(authErrorKey(error)));
        return;
      }
      formRef.current?.reset();
      setSent(true);
    } catch {
      setFormError(te("network"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      <CardBody className="space-y-5">
        <div>
          <p className="text-sm font-medium text-ink">{t("currentEmail")}</p>
          <p className="mt-1 text-base text-ink-muted">{currentEmail}</p>
        </div>
        {sent ? <FormNotice>{t("emailChangeSent")}</FormNotice> : null}
        <FormError>{formError}</FormError>
        <Field label={t("newEmail")} errors={fe(errors, "newEmail")}>
          {(c) => (
            <Input
              {...c}
              name="newEmail"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
            />
          )}
        </Field>
      </CardBody>
      <CardFooter>
        <Button type="submit" variant="secondary" loading={pending}>
          {t("changeEmail")}
        </Button>
      </CardFooter>
    </form>
  );
}
