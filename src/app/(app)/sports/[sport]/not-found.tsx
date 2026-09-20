import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Inside the app shell: an unknown sport, or a drill that doesn't exist / isn't yours to see. */
export default async function SportNotFound() {
  const t = await getTranslations("notFound");
  return (
    <EmptyState
      title={t("title")}
      description={t("body")}
      action={
        <Button asChild variant="secondary">
          <Link href="/sports">{t("toSports")}</Link>
        </Button>
      }
    />
  );
}
