import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OAuthButtons } from "@/components/features/auth/oauth-buttons";
import { FormError } from "@/components/features/auth/shared";
import { SignInForm } from "@/components/features/auth/sign-in-form";
import { safeNext } from "@/lib/safe-redirect";
import { getViewer, oauthProviders } from "@/modules/identity";

export const metadata: Metadata = { title: "Sign in" };

/** Better Auth sends ?error=<code> back from a failed social sign-in. The code picks a message; it is never shown itself. */
type OAuthMessage = "cancelled" | "linked" | "unavailable" | "generic";
function oauthMessage(code: string | string[] | undefined): OAuthMessage | null {
  if (typeof code !== "string" || code.length === 0) return null;
  if (code === "access_denied") return "cancelled";
  if (/link|email_doesn/.test(code)) return "linked";
  if (/state|code|token|nonce|issuer|user_info|provider|oauth/.test(code)) return "unavailable";
  return "generic";
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  // Real check (database session), not just the cookie: signed-in users have nothing to do here.
  if (await getViewer()) redirect(next);

  const [t, to] = await Promise.all([
    getTranslations("auth.signIn"),
    getTranslations("auth.oauth.errors"),
  ]);
  const failure = oauthMessage(sp.error);
  const notice = sp.notice === "reset" || sp.notice === "deleted" ? sp.notice : undefined;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="display text-4xl text-ink">{t("title")}</h1>
        <p className="text-base text-ink-muted">{t("subtitle")}</p>
      </div>
      <FormError>{failure ? to(failure) : null}</FormError>
      <OAuthButtons providers={oauthProviders()} next={next} />
      <SignInForm next={next} notice={notice} />
      <p className="text-sm text-ink-muted">
        {t("noAccount")}{" "}
        <Link
          href="/sign-up"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {t("signUp")}
        </Link>
      </p>
    </div>
  );
}
