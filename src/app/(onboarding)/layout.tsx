import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/ui/brand";
import { CourtMark } from "@/components/ui/court-mark";

// Minimal, focused layout (no navigation to modules that aren't reachable yet). No auth decision
// here — the page calls requireViewer().
export default async function OnboardingLayout({ children }: LayoutProps<"/">) {
  const tc = await getTranslations("common");
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden px-4 py-5 sm:px-10">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        {tc("skipToContent")}
      </a>
      <CourtMark className="pointer-events-none absolute -right-16 -bottom-24 hidden h-[36rem] w-auto opacity-50 lg:block" />
      <header className="relative">
        <Wordmark />
      </header>
      <main id="main" className="relative flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-xl rounded-lg border border-line bg-surface-raised p-6 shadow-paper sm:p-9">
          {children}
        </div>
      </main>
    </div>
  );
}
