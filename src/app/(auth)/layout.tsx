import Link from "next/link";
import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BasketballCourtBackground, HalfCourt } from "@/components/basketball";
import { Wordmark } from "@/components/ui/brand";

/**
 * Sign-in, sign-up and the password screens: a dark "night game" surface (the `.arena` scope), the form in a glass panel
 * on the left, a court that draws itself on the right (desktop) — and a faint court behind the form on a phone.
 */
export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const [t, tc] = await Promise.all([getTranslations("auth.panel"), getTranslations("common")]);

  return (
    <div className="arena grid min-h-dvh text-ink arena-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        {tc("skipToContent")}
      </a>
      <div className="relative flex min-h-dvh flex-col px-4 py-5 sm:px-10">
        <BasketballCourtBackground animated={false} className="lg:hidden" />
        <header className="relative flex items-center justify-between">
          <Link href="/" aria-label={tc("appName")}>
            <Wordmark />
          </Link>
        </header>
        <main id="main" className="relative flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md rise rounded-2xl p-6 glass-panel sm:p-8">{children}</div>
        </main>
      </div>

      {/* The court panel: decorative, hidden on small screens. */}
      <aside className="relative hidden overflow-hidden border-l border-line lg:block">
        <HalfCourt
          animated
          className="absolute -right-16 -bottom-10 h-[112%] w-auto text-ink/[0.14]"
          strokeWidth={1.6}
        />
        <div className="relative flex h-full max-w-lg flex-col justify-end gap-5 p-14 pb-20">
          <p
            className="rise eyebrow text-accent"
            style={{ "--rise-delay": "300ms" } as React.CSSProperties}
          >
            {t("eyebrow")}
          </p>
          <p
            className="rise display text-7xl text-ink"
            style={{ "--rise-delay": "420ms" } as React.CSSProperties}
          >
            {t("title")}
          </p>
          <p
            className="max-w-sm rise text-base text-ink-muted"
            style={{ "--rise-delay": "540ms" } as React.CSSProperties}
          >
            {t("body")}
          </p>
          <ul
            className="mt-2 rise space-y-2.5 text-sm text-ink"
            style={{ "--rise-delay": "660ms" } as React.CSSProperties}
          >
            {(["plan", "ai", "share"] as const).map((k) => (
              <li key={k} className="flex items-center gap-2.5">
                <Check className="size-4 shrink-0 text-accent" aria-hidden />
                {t(`points.${k}`)}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
