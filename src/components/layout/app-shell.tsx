import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { BrandMark, Wordmark } from "@/components/ui/brand";
import { CourtMark } from "@/components/ui/court-mark";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import type { Viewer } from "@/modules/identity";
import type { NavSport } from "./nav";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * The authenticated shell: side rail (≥ md) → bottom tab bar (mobile), top bar, content.
 * It makes NO authorization decisions — layouts don't re-render on client navigation, so every
 * page and Server Action calls `requireViewer()` itself (ARCHITECTURE.md §2.1, §5.4). The viewer
 * passed in here is display data only.
 */
export async function AppShell({
  viewer,
  sports,
  children,
}: {
  viewer: Viewer | null;
  sports: NavSport[];
  children: React.ReactNode;
}) {
  const [t, tc, cookieStore] = await Promise.all([
    getTranslations("shell"),
    getTranslations("common"),
    cookies(),
  ]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)] print:block">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink print:hidden"
      >
        {tc("skipToContent")}
      </a>

      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface-raised md:flex print:hidden">
        <div className="flex h-16 items-center px-5">
          <Wordmark />
        </div>
        <div className="court-rule" />
        <nav aria-label={t("mainNav")} className="flex-1 px-3 py-4">
          <NavLinks variant="rail" sports={sports} />
        </nav>
        {viewer ? (
          <div className="relative overflow-hidden border-t border-line px-5 py-4">
            <CourtMark className="pointer-events-none absolute -right-8 -bottom-6 h-28 w-auto opacity-50" />
            <p className="eyebrow">{t("workspace")}</p>
            <p className="relative mt-1 truncate text-sm font-semibold text-ink">
              {viewer.organization.name}
            </p>
          </div>
        ) : null}
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:justify-end md:px-8 print:hidden">
          {/* Mobile has no side rail, so the workspace name lives here; on desktop the rail already shows it. */}
          <div className="flex min-w-0 items-center gap-3 md:hidden">
            <BrandMark className="size-8" />
            {viewer ? (
              <div className="min-w-0">
                <p className="eyebrow leading-none">{t("workspace")}</p>
                <p className="truncate text-sm font-semibold text-ink">
                  {viewer.organization.name}
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle initial={theme} />
            {viewer ? <UserMenu name={viewer.user.name} email={viewer.user.email} /> : null}
          </div>
        </header>

        <main id="main" className="flex-1 px-4 py-6 pb-28 md:px-8 md:py-10 md:pb-10 print:p-0">
          {/* a page may ask for more room (the design workspace) with a data-page-wide element inside it */}
          <div className="mx-auto w-full max-w-5xl has-[[data-page-wide]]:max-w-[92rem] print:max-w-none">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile tab bar */}
      <nav
        aria-label={t("mainNav")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        <NavLinks variant="bar" sports={sports} />
      </nav>
    </div>
  );
}
