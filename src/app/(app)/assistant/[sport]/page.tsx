import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AssistantChat } from "@/components/features/assistant/assistant-chat";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { can } from "@/lib/authz/can";
import { isUuid } from "@/lib/ids";
import {
  assistantAvailability,
  getConversation,
  listConversations,
  listMessages,
} from "@/modules/assistant";
import { toConversationDto, toMessageDto } from "@/modules/assistant/serialize";
import { requireViewer } from "@/modules/identity";
import { getPlan, listPlans } from "@/modules/plans";
import { getSport } from "@/modules/sports";

export const metadata: Metadata = { title: "AI Coach" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The AI Coaching Assistant for one sport. What it is working on comes from the URL (`?plan=`, `?c=`, `?prompt=`) — all of it
 * untrusted: a session or conversation that is not the viewer's is simply not found, and a prompt only fills the box (it is
 * never sent for the coach).
 */
export default async function AssistantPage({
  params,
  searchParams,
}: PageProps<"/assistant/[sport]">) {
  const [{ sport: key }, sp] = await Promise.all([params, searchParams]);
  const { actor } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  const t = await getTranslations("assistant");
  const { available } = assistantAvailability();
  const canAuthor = can(actor, "plan:create", { organizationId: actor.organizationId });

  const header = (
    <header className="space-y-2">
      <p className="eyebrow text-accent">{sport.name}</p>
      <h1 className="display text-4xl text-ink md:text-5xl">{t("title")}</h1>
      <p className="max-w-2xl text-base text-ink-muted">{t("subtitle")}</p>
    </header>
  );

  if (!available || !canAuthor) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {header}
        <Card>
          <CardBody className="space-y-4" data-testid="assistant-unavailable">
            <h2 className="text-lg font-semibold text-ink">
              {canAuthor ? t("unavailable.title") : t("noRole.title")}
            </h2>
            <p className="text-base text-ink-muted">
              {canAuthor ? t("unavailable.body") : t("noRole.body")}
            </p>
            {canAuthor ? (
              <Button asChild>
                <Link href={`/sessions/${sport.key}/generate`}>{t("unavailable.generator")}</Link>
              </Button>
            ) : null}
          </CardBody>
        </Card>
      </div>
    );
  }

  const conversationId = first(sp.c);
  const conversation =
    conversationId && isUuid(conversationId) ? await getConversation(actor, conversationId) : null;
  if (conversationId && (!conversation || conversation.sportKey !== sport.key)) notFound();
  const planParam = first(sp.plan);
  const planId = planParam && isUuid(planParam) ? planParam : (conversation?.planId ?? null);
  const [plan, history, messages, recent] = await Promise.all([
    planId ? getPlan(actor, sport.key, planId) : Promise.resolve(null),
    listConversations(actor, sport.key),
    conversation ? listMessages(actor, conversation.id) : Promise.resolve([]),
    listPlans(actor, sport.key, { limit: 20, statuses: ["draft", "published"] }),
  ]);
  const prompt = (first(sp.prompt) ?? "").slice(0, 500);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {header}
      <AssistantChat
        key={conversation?.id ?? `new-${planId ?? "none"}`}
        sportKey={sport.key}
        conversationId={conversation?.id ?? null}
        initialMessages={messages.map(toMessageDto)}
        conversations={history.map(toConversationDto)}
        context={{
          planId: plan?.id ?? null,
          planTitle: plan?.title ?? null,
          activityCount: plan?.activities.length ?? 0,
        }}
        sessions={(recent?.items ?? []).map((s) => ({ id: s.id, title: s.title }))}
        initialPrompt={prompt}
      />
    </div>
  );
}
