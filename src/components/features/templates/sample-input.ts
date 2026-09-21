import "server-only";
import { getTranslations } from "next-intl/server";
import type { Actor } from "@/lib/authz/can";
import { buildSampleDocumentInput } from "@/modules/plans";

/**
 * The sample session a template is previewed on: real library drills under invented, translated details. Built fresh
 * on every request, stored nowhere, never one of the viewer's own sessions.
 */
export async function loadSampleInput(actor: Actor, sportKey: string, coachName: string) {
  const t = await getTranslations("templates.sample");
  return buildSampleDocumentInput(actor, sportKey, {
    title: t("title"),
    teamName: t("team"),
    goal: t("goal"),
    location: t("location"),
    season: t("season"),
    coachName,
    clubName: t("club"),
    objective: {
      primary: t("objectiveMain"),
      secondary: [t("objectiveAlso1"), t("objectiveAlso2")],
    },
    breakTitle: t("breakTitle"),
    customTitle: t("customTitle"),
    customDescription: t("customDescription"),
  });
}
