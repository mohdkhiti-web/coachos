import { getRequestConfig } from "next-intl/server";

/**
 * next-intl without URL locale routing (ARCHITECTURE.md §2.5): the app is behind login, so SEO
 * is irrelevant and the locale belongs to the user's profile. English only for now — adding a
 * language = adding messages/<locale>.json and reading `profiles.locale` here (Appendix A #1).
 */
export default getRequestConfig(async () => {
  const locale = "en";
  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
  };
});
