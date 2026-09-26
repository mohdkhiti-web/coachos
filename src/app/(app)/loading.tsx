import { getTranslations } from "next-intl/server";
import { BasketballLoading } from "@/components/basketball";

/** The fallback for any signed-in page that is still loading: a ball dribbling on a court line, and nothing artificial in the way. */
export default async function Loading() {
  const t = await getTranslations("common");
  return <BasketballLoading label={t("preparingCourt")} />;
}
