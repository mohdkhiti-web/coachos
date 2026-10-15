import { getTranslations } from "next-intl/server";
import { BasketballCourtBackground } from "@/components/basketball";
import { Wordmark } from "@/components/ui/brand";

// A focused, full-screen "night game" layout: no navigation to modules that aren't reachable yet. No auth decision
// here — the page calls requireViewer().
export default async function OnboardingLayout({ children }: LayoutProps<"/">) {
  const tc = await getTranslations("common");
  return (
    <div className="arena relative flex min-h-dvh flex-col overflow-hidden px-4 py-5 text-ink arena-surface sm:px-10">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        {tc("skipToContent")}
      </a>
      <BasketballCourtBackground animated={false} />
      <header className="relative">
        <Wordmark />
      </header>
      <main id="main" className="relative flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-3xl rounded-2xl p-6 glass-panel sm:p-10">{children}</div>
      </main>
    </div>
  );
}
