"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormError } from "@/components/features/auth/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { createPlanAction } from "@/modules/plans/actions";
import { SessionFields, type SessionCatalog } from "./session-fields";
import {
  fieldsFromServer,
  toPayload,
  validateSession,
  type FieldErrors,
  type SessionFormValues,
} from "./session-model";

/**
 * "Create session": the essentials, then straight into the builder. The browser checks the form for speed (with
 * the server's own schema); the Server Action checks it again, and its answer is authoritative.
 */
export function SessionCreateForm({
  sportKey,
  initial,
  catalog,
  showVisibility,
  cancelHref,
}: {
  sportKey: string;
  initial: SessionFormValues;
  catalog: SessionCatalog;
  showVisibility: boolean;
  cancelHref: string;
}) {
  const t = useTranslations("sessions.new");
  const te = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [focusTick, setFocusTick] = React.useState(0);
  const [pending, startTransition] = React.useTransition();

  // after a failed submit, move focus to the first invalid control so keyboard and screen-reader users land on it
  React.useEffect(() => {
    if (focusTick === 0) return;
    const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  }, [focusTick]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFailure(null);
    const local = validateSession(values, { requirePrimary: true });
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setFailure("VALIDATION");
      setFocusTick((n) => n + 1);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await createPlanAction(sportKey, toPayload(values));
      if (result?.ok) {
        toast(t("created"), "success");
        router.push(`/sessions/${sportKey}/${result.data.id}`);
        return;
      }
      const code = result && !result.ok ? result.error.code : "INTERNAL";
      setErrors(fieldsFromServer(result && !result.ok ? result.error.fields : undefined));
      setFailure(code);
      setFocusTick((n) => n + 1);
    });
  }

  const failureText =
    failure === "VALIDATION"
      ? t("fixErrors")
      : failure
        ? te.has(failure)
          ? te(failure)
          : te("generic")
        : null;

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-busy={pending}>
      <Card>
        <CardBody className="space-y-8">
          <SessionFields
            values={values}
            onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
            errors={errors}
            catalog={catalog}
            showVisibility={showVisibility}
            disabled={pending}
          />
        </CardBody>
        <CardFooter className="justify-between">
          <div className="min-w-0 flex-1">
            {failureText ? <FormError>{failureText}</FormError> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="ghost">
              <Link href={cancelHref}>{t("cancel")}</Link>
            </Button>
            <Button type="submit" size="lg" loading={pending}>
              {t("submit")}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
