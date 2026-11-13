import "server-only";
import type { Actor } from "@/lib/authz/can";
import { trainingWindow } from "@/lib/calendar";
import { listPlans } from "@/modules/plans";
import type { SessionLite } from "./insights";

/**
 * The sessions a roster page needs to show each team's training: every live, dated session from the start of the
 * dashboard's eight-week window onward, in each sport the teams play. One `listPlans` per sport (row-level security
 * decides what exists), matched to teams by name afterwards in `teamPulse`.
 */
export async function rosterSessions(
  actor: Actor,
  sportKeys: readonly string[],
  today: string,
): Promise<SessionLite[]> {
  const { from } = trainingWindow(today);
  const pages = await Promise.all(
    [...new Set(sportKeys)].map((key) =>
      listPlans(actor, key, { statuses: ["draft", "published"], from, limit: 100 }),
    ),
  );
  return pages.flatMap((p) =>
    (p?.items ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      teamName: s.teamName,
      scheduledDate: s.scheduledDate,
      startTime: s.startTime,
      totalMinutes: s.totalMinutes,
    })),
  );
}
