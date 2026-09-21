import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function SharedNotFound() {
  const t = await getTranslations("share.public");
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <p className="eyebrow text-accent">CoachOS</p>
      <h1 className="display text-4xl text-ink">{t("unavailableTitle")}</h1>
      <p className="text-base text-ink-muted">{t("unavailableBody")}</p>
      <Link
        href="/"
        className="focus-visible:outline-focus inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent underline underline-offset-4 focus-visible:outline-2"
      >
        {t("home")}
      </Link>
    </main>
  );
}
