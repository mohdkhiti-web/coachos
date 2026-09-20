import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/brand";
import { CourtMark } from "@/components/ui/court-mark";
import { SectionMarker } from "@/components/ui/section-marker";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { getViewer } from "@/modules/identity";

export default async function LandingPage() {
  const [t, tc, viewer, cookieStore] = await Promise.all([
    getTranslations("landing"),
    getTranslations("common"),
    getViewer(),
    cookies(),
  ]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        {tc("skipToContent")}
      </a>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle initial={theme} />
          {viewer ? (
            <Button asChild size="sm">
              <Link href="/dashboard">{t("nav.dashboard")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">{t("nav.signIn")}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-up">{t("nav.signUp")}</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main id="main" className="relative flex-1">
        {/* Court lines run behind the hero: structural ornament, not decoration for its own sake. */}
        <CourtMark className="pointer-events-none absolute top-4 -right-24 hidden h-[34rem] w-auto opacity-60 md:block" />

        <section className="relative mx-auto w-full max-w-6xl px-4 pt-12 pb-16 sm:px-8 md:pt-20 md:pb-24">
          <p className="mb-6 eyebrow text-accent">{t("eyebrow")}</p>
          <h1 className="max-w-[44rem] display text-[3.25rem] text-ink uppercase sm:text-7xl md:text-[5.25rem]">
            {t("title")}
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-muted">{t("subtitle")}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            {viewer ? (
              <Button asChild size="lg">
                <Link href="/dashboard">
                  {t("ctaDashboard")}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link href="/sign-up">
                    {t("ctaPrimary")}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/sign-in">{t("ctaSecondary")}</Link>
                </Button>
              </>
            )}
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-6xl px-4 pb-20 sm:px-8">
          <div className="mb-8 court-rule" />
          <div className="grid gap-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-12">
            <SectionMarker n={1}>{t("statusTitle")}</SectionMarker>
            <p className="max-w-2xl text-base leading-relaxed text-ink">{t("statusBody")}</p>
          </div>
        </section>
      </main>

      <footer className="relative mx-auto w-full max-w-6xl px-4 pb-8 text-sm text-ink-muted sm:px-8">
        <div className="mb-5 court-rule" />
        {t("footer", { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
}
