import type { Metadata } from "next";
import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/features/auth/reset-password-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = first(sp.token);
  const t = await getTranslations("auth.reset");

  // Better Auth redirects here with ?token=… (valid) or ?error=INVALID_TOKEN (expired/used).
  if (!token || first(sp.error)) {
    return (
      <div className="space-y-6">
        <div className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <LinkIcon className="size-6" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="display text-4xl text-ink">{t("invalidTitle")}</h1>
          <p className="text-base text-ink-muted">{t("invalidBody")}</p>
        </div>
        <Button asChild>
          <Link href="/forgot-password">{t("requestNew")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="display text-4xl text-ink">{t("title")}</h1>
        <p className="text-base text-ink-muted">{t("subtitle")}</p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
