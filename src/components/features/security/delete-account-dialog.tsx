"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import {
  FormError,
  PasswordInput,
  useFieldErrorTranslator,
  type FieldErrorMap,
} from "@/components/features/auth/shared";
import { authClient } from "@/modules/identity/client";
import { authErrorKey } from "@/modules/identity/auth-errors";
import { deleteAccountSchema, fieldErrors } from "@/modules/identity/validators";

/** Account erasure needs the password (re-authentication) AND a typed confirmation. */
export function DeleteAccountDialog() {
  const t = useTranslations("settings.danger");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const fe = useFieldErrorTranslator();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrorMap>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const parsed = deleteAccountSchema.safeParse({
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
      const { error } = await authClient.deleteUser({ password: parsed.data.password });
      if (error) {
        setFormError(te(authErrorKey(error)));
        setPending(false);
        return;
      }
      router.replace("/sign-in?notice=deleted");
      router.refresh();
    } catch {
      setFormError(te("network"));
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setErrors({});
          setFormError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="danger">{t("button")}</Button>
      </DialogTrigger>
      <DialogContent
        title={t("dialogTitle")}
        description={t("dialogBody")}
        closeLabel={tc("close")}
      >
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <FormError>{formError}</FormError>
          <Field label={t("password")} errors={fe(errors, "password")}>
            {(c) => (
              <PasswordInput {...c} name="password" autoComplete="current-password" required />
            )}
          </Field>
          <Field label={t("confirm")} errors={fe(errors, "confirm")}>
            {(c) => (
              <Input
                {...c}
                name="confirm"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
              />
            )}
          </Field>
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {tc("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" variant="danger" loading={pending}>
              {t("confirmAction")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
