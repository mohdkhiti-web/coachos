import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/components/features/auth/sign-in-form";
import { safeNext } from "@/lib/safe-redirect";
import { getViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  // Real check (database session), not just the cookie: signed-in users have nothing to do here.
  if (await getViewer()) redirect(next);

  const t = await getTranslations("auth.signIn");
  const notice = sp.notice === "reset" || sp.notice === "deleted" ? sp.notice : undefined;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="display text-4xl text-ink">{t("title")}</h1>
        <p className="text-base text-ink-muted">{t("subtitle")}</p>
      </div>
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
