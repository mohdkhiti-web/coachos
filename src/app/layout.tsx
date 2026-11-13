import type { Metadata, Viewport } from "next";
import { Archivo, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { env } from "@/lib/env";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "@/styles/globals.css";

// One family for the whole product: Archivo's width axis gives the interface (100%) and the condensed
// scoresheet numerals and display titles (75-80%) from a single variable font.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "CoachOS", template: "%s · CoachOS" },
  description:
    "CoachOS is the operating system for basketball coaches: plan practices, build sessions, and coach with an AI assistant.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#121f3b" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, messages, t, cookieStore, headerStore] = await Promise.all([
    getLocale(),
    getMessages(),
    getTranslations("common"),
    cookies(),
    headers(),
  ]);
  // Per-request CSP nonce set by src/proxy.ts. Radix's scroll lock (used by Dialog) injects a <style>
  // element at runtime and reads `__webpack_nonce__` to nonce it; without this the strict
  // style-src blocks it. The nonce is server-generated base64, never user input.
  const nonce = headerStore.get("x-nonce") ?? undefined;
  // "system" leaves the attribute off so prefers-color-scheme decides; explicit choices are set
  // server-side from the cookie, which is what prevents a flash of the wrong theme.
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html
      lang={locale}
      data-theme={theme === "system" ? undefined : theme}
      className={`${archivo.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {nonce ? (
          // Browsers hide the `nonce` attribute from the DOM after parsing, so React would report a hydration mismatch on it.
          <script
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              __html: `window.__webpack_nonce__=${JSON.stringify(nonce)};`,
            }}
          />
        ) : null}
      </head>
      <body className="min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TooltipProvider>
            <ToastProvider dismissLabel={t("dismiss")}>{children}</ToastProvider>
          </TooltipProvider>
        </NextIntlClientProvider>
        {/* Only loads on an actual Vercel deployment: elsewhere its script 404s and the CSP correctly blocks it. */}
        {env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  );
}
