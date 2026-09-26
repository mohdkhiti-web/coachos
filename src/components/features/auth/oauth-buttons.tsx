"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { OAuthProviders } from "@/modules/identity/oauth";
import { authClient } from "@/modules/identity/client";
import { FormError } from "./shared";

/**
 * "Continue with Google / Apple". It renders ONLY for providers this deployment has credentials for (the server passes
 * `providers`), so there is never a button that cannot work. Each click starts Better Auth's real OAuth redirect; the
 * provider sends the coach back to /api/auth/callback/<provider>, which signs them in and lands on `next`.
 */

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className="size-5">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.15 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.86-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.76 12 4.76Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className="size-5" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

type Provider = "google" | "apple";

export function OAuthButtons({
  providers,
  next,
  className,
}: {
  providers: OAuthProviders;
  /** Where a returning coach lands after signing in (already checked by safeNext on the server). */
  next: string;
  className?: string;
}) {
  const t = useTranslations("auth.oauth");
  const te = useTranslations("errors");
  const [busy, setBusy] = React.useState<Provider | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!providers.google && !providers.apple) return null;

  async function go(provider: Provider) {
    setError(null);
    setBusy(provider);
    try {
      const { error: failure } = await authClient.signIn.social({
        provider,
        callbackURL: next,
        newUserCallbackURL: "/onboarding",
        // Better Auth appends ?error=<code>; the sign-in page turns the code into a message (it never echoes it).
        errorCallbackURL: "/sign-in",
      });
      // Success navigates away (the redirect to the provider); if we are still here, it did not start.
      if (failure) {
        setError(t("errors.unavailable"));
        setBusy(null);
      }
    } catch {
      setError(te("network"));
      setBusy(null);
    }
  }

  const label = (p: Provider) =>
    busy === p ? t("redirecting", { provider: p === "google" ? "Google" : "Apple" }) : t(p);

  return (
    <div className={className}>
      <FormError className="mb-4">{error}</FormError>
      <div className="grid gap-3">
        {providers.google ? (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={busy !== null}
            aria-busy={busy === "google" || undefined}
            onClick={() => void go("google")}
          >
            <GoogleMark />
            {label("google")}
          </Button>
        ) : null}
        {providers.apple ? (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={busy !== null}
            aria-busy={busy === "apple" || undefined}
            onClick={() => void go("apple")}
          >
            <AppleMark />
            {label("apple")}
          </Button>
        ) : null}
      </div>
      <div className="my-6 flex items-center gap-4" role="separator">
        <span className="h-px flex-1 bg-line" />
        <span className="eyebrow">{t("divider")}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
