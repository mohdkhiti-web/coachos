import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SignUpForm } from "@/components/features/auth/sign-up-form";
import { getViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (await getViewer()) redirect("/dashboard");
  const t = await getTranslations("auth.signUp");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="display text-4xl text-ink">{t("title")}</h1>
        <p className="text-base text-ink-muted">{t("subtitle")}</p>
      </div>
      <SignUpForm />
      <p className="text-sm text-ink-muted">
        {t("haveAccount")}{" "}
        <Link
          href="/sign-in"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
