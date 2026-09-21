import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SessionCreateForm } from "@/components/features/sessions/session-create-form";
import { emptySessionValues } from "@/components/features/sessions/session-model";
import { can } from "@/lib/authz/can";
import { listTimezones } from "@/lib/timezones";
import { requireViewer } from "@/modules/identity";
import { getAgeGroups, getObjectives, getSport } from "@/modules/sports";
import { listTemplateChoices } from "@/modules/templates";
import { getSportModule } from "@/sports/registry";

export const metadata: Metadata = { title: "Create session" };

export default async function NewSessionPage({
  params,
  searchParams,
}: PageProps<"/sessions/[sport]/new">) {
  const [{ sport: key }, sp] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer();
  const sport = await getSport(key);
  const mod = sport ? getSportModule(sport.key) : undefined;
  if (!sport || !mod) notFound();
  const base = `/sessions/${sport.key}`;
  // assistants read and run sessions but do not author; the server action enforces this again
  if (!can(viewer.actor, "plan:create", { organizationId: viewer.actor.organizationId }))
    redirect(base);

  const [t, ageGroups, objectives, templates] = await Promise.all([
    getTranslations("sessions.new"),
    getAgeGroups(sport.id),
    getObjectives(sport.id),
    listTemplateChoices(viewer.actor, sport.key),
  ]);
  // a link from the Templates page (?template=…) preselects it — but only a template this viewer can actually use
  const wanted = typeof sp.template === "string" ? sp.template : "";
  const initialTemplateId = templates.some((x) => x.id === wanted) ? wanted : "";
  const personal = viewer.organization.type === "personal";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow text-accent">{sport.name}</p>
        <h1 className="display text-4xl text-ink md:text-5xl">{t("title")}</h1>
        <p className="max-w-2xl text-base text-ink-muted">{t("subtitle")}</p>
      </header>
      <SessionCreateForm
        sportKey={sport.key}
        initial={emptySessionValues({
          timezone: viewer.profile.timezone ?? "UTC",
          coachName: viewer.user.name,
          clubName: personal ? "" : viewer.organization.name,
          targetMinutes: mod.defaults.sessionMinutes,
        })}
        catalog={{
          ageGroups: ageGroups.map((g) => ({
            key: g.key,
            name: g.name,
            ageMin: g.ageMin,
            ageMax: g.ageMax,
          })),
          objectives: objectives.map((o) => ({ key: o.key, name: o.name })),
          timezones: listTimezones(),
        }}
        showVisibility={!personal}
        cancelHref={base}
        templates={templates}
        initialTemplateId={initialTemplateId}
      />
    </div>
  );
}
