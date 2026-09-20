import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { CourtMark } from "@/components/ui/court-mark";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <CourtMark className="h-32 w-auto opacity-70" />
      <div className="space-y-2">
        <p className="numeral text-6xl font-semibold text-accent">404</p>
        <h1 className="display text-4xl text-ink">{t("title")}</h1>
        <p className="mx-auto max-w-md text-base text-ink-muted">{t("body")}</p>
      </div>
      <Button asChild>
        <Link href="/">{t("home")}</Link>
      </Button>
    </main>
  );
}
