"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ErrorCode, FormState } from "@/lib/result";
import { FormError } from "@/components/features/auth/shared";

/** Shows a success toast each time a submitted action returns ok. */
export function useSuccessToast(state: FormState, message: string) {
  const { toast } = useToast();
  React.useEffect(() => {
    if (state?.ok) toast(message, "success");
    // `state` is a fresh object per submission, so this fires once per successful save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

/** Field-level errors (already-translated) from a failed action result. */
export function useActionFieldErrors(state: FormState) {
  const tv = useTranslations("validation");
  return (field: string): string[] | undefined => {
    if (!state || state.ok) return undefined;
    return state.error.fields?.[field]?.map((k) => (tv.has(k) ? tv(k) : k));
  };
}

/** Form-level error banner for non-validation failures (FORBIDDEN, INTERNAL, …). */
export function ActionError({ state }: { state: FormState }) {
  const te = useTranslations("errors");
  if (!state || state.ok || state.error.code === "VALIDATION") return null;
  const code: ErrorCode = state.error.code;
  return <FormError>{te.has(code) ? te(code) : te("generic")}</FormError>;
}

/** Standard submit button for settings cards (label switches while saving). */
export function SaveButton({ pending }: { pending: boolean }) {
  const tc = useTranslations("common");
  return (
    <Button type="submit" loading={pending}>
      {pending ? tc("saving") : tc("save")}
    </Button>
  );
}

export function failedValue(state: FormState, field: string): string | undefined {
  return state && !state.ok ? state.values?.[field] : undefined;
}
