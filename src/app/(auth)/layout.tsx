import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Wordmark } from "@/components/ui/brand";
import { CourtMark } from "@/components/ui/court-mark";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const [t, tc, cookieStore] = await Promise.all([
    getTranslations("auth.panel"),
    getTranslations("common"),
    cookies(),
  ]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        {tc("skipToContent")}
      </a>
      <div className="flex min-h-dvh flex-col px-4 py-5 sm:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label={tc("appName")}>
            <Wordmark />
          </Link>
          <ThemeToggle initial={theme} />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>

      {/* Paper panel: court lines + one confident statement. Decorative; hidden on small screens. */}
      <aside className="relative hidden overflow-hidden border-l border-line bg-surface-sunken lg:block">
        <CourtMark className="absolute -right-24 -bottom-16 h-[110%] w-auto text-line-strong opacity-70" />
        <div className="relative flex h-full max-w-lg flex-col justify-end gap-5 p-14 pb-20">
          <p className="eyebrow text-accent">{t("eyebrow")}</p>
          <p className="display text-6xl text-ink">{t("title")}</p>
          <p className="max-w-sm text-base text-ink-muted">{t("body")}</p>
        </div>
      </aside>
    </div>
  );
}
