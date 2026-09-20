"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CourtMark } from "@/components/ui/court-mark";

/** Shared body for route-level error boundaries. Shows only the opaque digest, never error details. */
export function ErrorView({ digest, retry }: { digest?: string; retry: () => void }) {
  const t = useTranslations("errorPage");
  const tc = useTranslations("common");
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-5 py-16 text-center"
    >
      <CourtMark className="h-28 w-auto opacity-70" />
      <div className="space-y-2">
        <h1 className="display text-4xl text-ink">{t("title")}</h1>
        <p className="text-base text-ink-muted">{t("body")}</p>
        {digest ? (
          <p className="numeral text-sm text-ink-faint">{t("digest", { digest })}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()}>{tc("tryAgain")}</Button>
        <Button asChild variant="secondary">
          <Link href="/dashboard">{t("home")}</Link>
        </Button>
      </div>
    </div>
  );
}
