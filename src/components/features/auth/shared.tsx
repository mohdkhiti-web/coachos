"use client";

import * as React from "react";
import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export type FieldErrorMap = Record<string, string[] | undefined>;

/** Translate validation message keys (`validation.*`) for one field. */
export function useFieldErrorTranslator() {
  const tv = useTranslations("validation");
  return (errors: FieldErrorMap, field: string): string[] | undefined =>
    errors[field]?.map((key) => (tv.has(key) ? tv(key) : key));
}

export function FormError({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-md border border-danger bg-danger-soft px-3.5 py-3 text-sm font-medium text-ink",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function FormNotice({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-md border border-success bg-success-soft px-3.5 py-3 text-sm font-medium text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Password input with a show/hide toggle (aria-pressed, labelled) — helps mobile typing and passphrases. */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const t = useTranslations("common");
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-12", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-ink-muted hover:text-ink"
      >
        {visible ? (
          <EyeOff className="size-[18px]" aria-hidden />
        ) : (
          <Eye className="size-[18px]" aria-hidden />
        )}
      </button>
    </div>
  );
}
