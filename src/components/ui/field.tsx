"use client";

import * as React from "react";
import { Label } from "radix-ui";
import { cn } from "@/lib/cn";

const controlBase =
  "block w-full rounded-md border border-line-strong bg-surface-raised px-3 text-base text-ink placeholder:text-ink-faint transition-colors focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(controlBase, "h-11", className)} {...props} />;
}

/** Native <select>: best a11y + mobile UX for long lists (e.g. ~400 IANA timezones). */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(controlBase, "h-11 appearance-none bg-no-repeat pr-9", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none' stroke='%238a8372' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 0.85rem center",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(controlBase, "min-h-24 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-5 shrink-0 cursor-pointer rounded-xs border-line-strong accent-accent",
        className,
      )}
      {...props}
    />
  );
}

type FieldProps = {
  label: string;
  /** Error messages, already translated. */
  errors?: string[];
  hint?: string;
  className?: string;
  /** Render-prop receives the ids/aria wiring to spread onto the control. */
  children: (control: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": true | undefined;
  }) => React.ReactNode;
};

/** Label + control + hint + error, with correct aria wiring so screen readers announce all of it. */
export function Field({ label, errors, hint, className, children }: FieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label.Root htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </Label.Root>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": errorId ? true : undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {errorId ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger">
          {errors!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
