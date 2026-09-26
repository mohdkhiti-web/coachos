import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  ClipboardList,
  FileText,
  PenLine,
  Share2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  BasketballCourtBackground,
  BasketballHeroScene,
  CoachImage,
} from "@/components/basketball";
import { DrillDiagram } from "@/components/features/drills/drill-diagram";
import { LANDING_DIAGRAM } from "@/components/features/marketing/landing-diagram";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/brand";
import { SectionMarker } from "@/components/ui/section-marker";
import type { ImageSlot } from "@/components/basketball/imagery";
import { getViewer } from "@/modules/identity";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.meta");
  return {
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: { title: t("title"), description: t("description"), type: "website" },
  };
}

const FEATURES: Array<{
  key: "planner" | "library" | "ai" | "diagrams" | "documents" | "share";
  icon: LucideIcon;
}> = [
  { key: "planner", icon: ClipboardList },
  { key: "library", icon: BookOpen },
  { key: "ai", icon: Sparkles },
  { key: "diagrams", icon: PenLine },
  { key: "documents", icon: FileText },
  { key: "share", icon: Share2 },
];

const HOW: Array<{ key: "profile" | "build" | "coach"; slot: ImageSlot }> = [
  { key: "profile", slot: "landing.huddle" },
  { key: "build", slot: "landing.planning" },
  { key: "coach", slot: "landing.shooting" },
];

const delay = (ms: number) => ({ "--rise-delay": `${ms}ms` }) as React.CSSProperties;

export default async function LandingPage() {
  const [t, tc, viewer] = await Promise.all([
    getTranslations("landing"),
    getTranslations("common"),
    getViewer(),
  ]);
  const start = viewer ? "/dashboard" : "/sign-up";

  return (
    <div className="arena relative flex min-h-dvh flex-col overflow-x-clip text-ink arena-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        {tc("skipToContent")}
      </a>

      <header className="sticky top-0 z-40 border-b border-line/60 bg-surface/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/" aria-label={tc("appName")}>
            <Wordmark />
          </Link>
          <nav aria-label={t("nav.primary")} className="flex items-center gap-1.5 sm:gap-2">
            <ul className="mr-3 hidden items-center gap-6 text-sm text-ink-muted md:flex">
              <li>
                <a href="#platform" className="grow-underline hover:text-ink">
                  {t("nav.platform")}
                </a>
              </li>
              <li>
                <a href="#ai-coach" className="grow-underline hover:text-ink">
                  {t("nav.aiCoach")}
                </a>
              </li>
              <li>
                <a href="#how" className="grow-underline hover:text-ink">
                  {t("nav.howItWorks")}
                </a>
              </li>
            </ul>
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
        </div>
      </header>

      <main id="main" className="relative flex-1">
        {/* ---------------------------------------------------------------- hero */}
        <section className="relative isolate">
          <BasketballCourtBackground className="md:hidden" />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-4 pt-14 pb-16 sm:px-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:pt-20 md:pb-24 lg:gap-12">
            <div className="relative">
              <p className="mb-5 rise eyebrow text-accent">{t("eyebrow")}</p>
              <h1>
                <span
                  className="block rise display text-[4.25rem] leading-[0.92] text-ink uppercase sm:text-[6.5rem] lg:text-[8rem]"
                  style={delay(80)}
                >
                  Coach<span className="text-ember">OS</span>
                </span>
                <span
                  className="mt-4 block max-w-lg rise display text-[1.75rem] leading-[1.1] text-ink sm:text-[2.25rem]"
                  style={delay(200)}
                >
                  {t("title")}
                </span>
              </h1>
              <p
                className="mt-6 max-w-xl rise text-lg leading-relaxed text-ink-muted"
                style={delay(340)}
              >
                {t("subtitle")}
              </p>
              <div className="mt-9 flex rise flex-wrap items-center gap-3" style={delay(480)}>
                <Button asChild size="lg">
                  <Link href={start}>
                    {viewer ? t("ctaDashboard") : t("ctaPrimary")}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <a href="#platform">{t("ctaSecondary")}</a>
                </Button>
              </div>
            </div>

            <div className="relative hidden aspect-[548/588] w-full max-w-[34rem] justify-self-end md:block">
              <BasketballHeroScene />
            </div>
          </div>

          <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-8">
            <div className="mb-6 court-rule" />
            <p className="sr-only">{t("proof.label")}</p>
            <ul className="grid gap-x-8 gap-y-3 text-sm text-ink-muted sm:grid-cols-2 lg:grid-cols-4">
              {(["diagrams", "timeline", "documents", "ai"] as const).map((k) => (
                <li key={k} className="flex items-center gap-2.5">
                  <Check className="size-4 shrink-0 text-accent" aria-hidden />
                  {t(`proof.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- platform */}
        <section
          id="platform"
          aria-labelledby="platform-h"
          className="scroll-mt-20 border-t border-line/60"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
            <SectionMarker n={1}>{t("platform.eyebrow")}</SectionMarker>
            <h2 id="platform-h" className="mt-4 max-w-3xl display text-4xl text-ink sm:text-6xl">
              {t("platform.title")}
            </h2>
            <p className="mt-4 max-w-2xl text-base text-ink-muted">{t("platform.intro")}</p>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ key, icon: Icon }) => (
                <li
                  key={key}
                  className="group relative interactive-surface overflow-hidden rounded-xl p-6 glass-panel"
                >
                  <span className="mb-5 inline-flex size-11 items-center justify-center rounded-lg border border-accent/40 bg-accent-soft text-accent">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="text-lg font-semibold tracking-tight text-ink">
                    {t(`platform.features.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {t(`platform.features.${key}.body`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- AI coach */}
        <section
          id="ai-coach"
          aria-labelledby="ai-h"
          className="scroll-mt-20 border-t border-line/60"
        >
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-8 lg:grid-cols-2">
            <div>
              <SectionMarker n={2}>{t("ai.eyebrow")}</SectionMarker>
              <h2 id="ai-h" className="mt-4 display text-4xl text-ink sm:text-6xl">
                {t("ai.title")}
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-ink-muted">
                {t("ai.body")}
              </p>
              <ol className="mt-8 space-y-3">
                {(["ask", "propose", "apply"] as const).map((k, i) => (
                  <li key={k} className="flex items-center gap-3.5 text-ink">
                    <span className="flex size-8 items-center justify-center rounded-full border border-accent/50 numeral text-sm text-accent">
                      {i + 1}
                    </span>
                    {t(`ai.steps.${k}`)}
                  </li>
                ))}
              </ol>
            </div>

            <figure className="relative overflow-hidden rounded-2xl p-5 glass-panel sm:p-6">
              <span className="absolute top-4 right-4 rounded-full border border-line-strong px-2.5 py-0.5 eyebrow">
                {t("ai.exampleTag")}
              </span>
              <p className="max-w-[85%] rounded-xl bg-accent px-4 py-3 text-[0.95rem] text-accent-ink">
                {t("ai.exampleRequest")}
              </p>
              <div className="mt-4 rounded-xl border border-line-strong bg-surface p-4">
                <p className="eyebrow">{t("ai.exampleTitle")}</p>
                <ol className="mt-3 divide-y divide-line text-sm">
                  {(
                    [
                      ["warmup", 10],
                      ["form", 15],
                      ["spots", 15],
                      ["game", 15],
                      ["cool", 5],
                    ] as const
                  ).map(([k, min]) => (
                    <li key={k} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-ink">{t(`ai.example.${k}`)}</span>
                      <span className="numeral text-ink-muted">{min} min</span>
                    </li>
                  ))}
                </ol>
              </div>
              <figcaption className="mt-4 text-xs text-ink-muted">{t("ai.exampleNote")}</figcaption>
            </figure>
          </div>
        </section>

        {/* ---------------------------------------------------------------- how */}
        <section id="how" aria-labelledby="how-h" className="scroll-mt-20 border-t border-line/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
            <SectionMarker n={3}>{t("how.eyebrow")}</SectionMarker>
            <h2 id="how-h" className="mt-4 max-w-3xl display text-4xl text-ink sm:text-6xl">
              {t("how.title")}
            </h2>
            <ol className="mt-12 grid gap-6 lg:grid-cols-3">
              {HOW.map(({ key, slot }, i) => (
                <li key={key} className="overflow-hidden rounded-2xl glass-panel">
                  <div className="border-b border-line bg-surface-sunken/60 p-4">
                    <CoachImage slot={slot} className="mx-auto max-h-44" />
                  </div>
                  <div className="p-6">
                    <p className="numeral text-sm text-accent">0{i + 1}</p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink">
                      {t(`how.steps.${key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                      {t(`how.steps.${key}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------------- diagrams */}
        <section aria-labelledby="diagrams-h" className="border-t border-line/60">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div>
              <SectionMarker n={4}>{t("diagrams.eyebrow")}</SectionMarker>
              <h2 id="diagrams-h" className="mt-4 display text-4xl text-ink sm:text-6xl">
                {t("diagrams.title")}
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-ink-muted">
                {t("diagrams.body")}
              </p>
            </div>
            <figure className="overflow-hidden rounded-2xl glass-panel">
              <DrillDiagram
                diagram={LANDING_DIAGRAM}
                title={t("diagrams.caption")}
                className="block h-auto w-full"
              />
              <figcaption className="border-t border-line px-5 py-3 text-sm text-ink-muted">
                {t("diagrams.caption")}
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ---------------------------------------------------------------- final call + honest status */}
        <section
          aria-labelledby="cta-h"
          className="relative overflow-hidden border-t border-line/60"
        >
          <BasketballCourtBackground animated={false} />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-8">
            <h2 id="cta-h" className="display text-5xl text-ink sm:text-7xl">
              {t("cta.title")}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base text-ink-muted">{t("cta.body")}</p>
            <div className="mt-8 flex justify-center">
              <Button asChild size="lg">
                <Link href={start}>
                  {viewer ? t("ctaDashboard") : t("cta.button")}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </div>
            <p className="mx-auto mt-14 max-w-2xl text-sm leading-relaxed text-ink-muted">
              <span className="font-semibold text-ink">{t("status.title")}. </span>
              {t("status.body")}
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-muted sm:px-8">
          <span>{t("footer", { year: new Date().getFullYear() })}</span>
          {viewer ? null : (
            <Link href="/sign-in" className="grow-underline hover:text-ink">
              {t("nav.signIn")}
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}
