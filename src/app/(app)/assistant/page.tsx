import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireViewer } from "@/modules/identity";
import { listActiveSports } from "@/modules/sports";

export const metadata: Metadata = { title: "AI Coach" };

/** "AI Coach" in the main navigation: straight to the sport's assistant when there is one sport, the choice otherwise. */
export default async function AssistantIndexPage() {
  await requireViewer();
  const sports = await listActiveSports();
  if (sports.length === 1) redirect(`/assistant/${sports[0]!.key}`);
  const t = await getTranslations("assistant");
  return (
    <div className="space-y-6">
      <h1 className="display text-5xl text-ink">{t("title")}</h1>
      <p className="text-base text-ink-muted">{t("chooseSport")}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sports.map((s) => (
          <li key={s.key}>
            <Link
              href={`/assistant/${s.key}`}
              className="flex min-h-14 items-center justify-between rounded-lg border border-line bg-surface-raised px-4 font-semibold text-ink hover:border-accent"
            >
              {s.name}
              <ArrowRight className="size-4 text-accent" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
