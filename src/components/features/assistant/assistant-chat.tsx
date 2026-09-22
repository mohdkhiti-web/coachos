"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CircleAlert,
  History,
  Plus,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { TypingDots } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  applyProposalAction,
  deleteConversationAction,
  dismissProposalAction,
} from "@/modules/assistant/actions";
import type { ConversationSummaryDto, MessageDto, StreamEvent } from "@/modules/assistant/dto";
import type { Proposal } from "@/modules/assistant/proposals";
import { ProposalCard } from "./proposal-card";

/**
 * The AI Coaching Assistant's chat (Step 8): the conversation, what it is working on, what it is doing right now, and its
 * suggestions as cards to apply. It is a coaching tool, not a general chat: the prompts on offer are coaching actions, and
 * everything the assistant proposes is a card the coach applies (or does not). The message goes to a streaming route so that
 * Cancel really stops the work; nothing the assistant says is ever treated as markup — it is shown as plain text.
 */

export interface ChatContext {
  planId: string | null;
  planTitle: string | null;
  activityCount: number;
}

export interface SessionChoice {
  id: string;
  title: string;
}

const MAX = 2000;

export function AssistantChat({
  sportKey,
  conversationId: initialConversationId,
  initialMessages,
  conversations,
  context,
  sessions,
  initialPrompt,
}: {
  sportKey: string;
  conversationId: string | null;
  initialMessages: MessageDto[];
  conversations: ConversationSummaryDto[];
  context: ChatContext;
  sessions: SessionChoice[];
  initialPrompt: string;
}) {
  const t = useTranslations("assistant");
  const te = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();
  const [messages, setMessages] = React.useState(initialMessages);
  const [conversationId, setConversationId] = React.useState(initialConversationId);
  const [text, setText] = React.useState(initialPrompt);
  const [sending, setSending] = React.useState(false);
  const [status, setStatus] = React.useState<StreamEvent | null>(null);
  const [failure, setFailure] = React.useState<{ code: string; retry: string } | null>(null);
  const [applying, setApplying] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  // Navigating to another conversation (a link in the history) replaces what is shown. A refresh of the SAME conversation - the
  // one this screen just created, or one whose list was refreshed - must not: it would close an open confirmation and lose typing.
  const [shownFromServer, setShownFromServer] = React.useState(initialConversationId);
  if (initialConversationId !== shownFromServer) {
    setShownFromServer(initialConversationId);
    if (initialConversationId !== conversationId) {
      setMessages(initialMessages);
      setConversationId(initialConversationId);
      setText(initialPrompt);
      setFailure(null);
    }
  }
  const controller = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, sending]);

  const send = React.useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || sending) return;
      setFailure(null);
      setSending(true);
      setStatus({ type: "status", phase: "thinking" });
      setAnnounce(t("status.thinking"));
      const temp: MessageDto = {
        id: `pending-${Date.now()}`,
        role: "user",
        createdAt: new Date().toISOString(),
        content: {
          schemaVersion: 1,
          text: message,
          proposals: [],
          sources: [],
          context: { planId: context.planId, planTitle: context.planTitle },
        },
      };
      setMessages((m) => [...m, temp]);
      setText("");
      const abort = new AbortController();
      controller.current = abort;
      try {
        const res = await fetch("/api/assistant/message", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            conversationId,
            sportKey,
            planId: context.planId,
            text: message,
          }),
        });
        if (!res.ok || !res.body) {
          const code =
            res.status === 401
              ? "UNAUTHENTICATED"
              : ((await res.json().catch(() => null))?.error?.code ?? "INTERNAL");
          setMessages((m) => m.filter((x) => x.id !== temp.id));
          setFailure({ code, retry: message });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let at: number;
          while ((at = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, at).trim();
            buffer = buffer.slice(at + 1);
            if (!line) continue;
            const event = JSON.parse(line) as StreamEvent;
            if (event.type === "status") {
              setStatus(event);
              if (event.phase === "tool" && event.tool)
                setAnnounce(
                  t.has(`status.tools.${event.tool}`)
                    ? t(`status.tools.${event.tool}`)
                    : t("status.working"),
                );
            } else if (event.type === "done") {
              setConversationId(event.conversation.id);
              setMessages((m) => [
                ...m.filter((x) => x.id !== temp.id),
                event.user,
                event.assistant,
              ]);
              setAnnounce(t("announce.answered"));
              if (!conversationId) {
                window.history.replaceState(
                  null,
                  "",
                  `/assistant/${sportKey}?c=${event.conversation.id}${context.planId ? `&plan=${context.planId}` : ""}`,
                );
                router.refresh(); // the history list
              }
              if (event.assistant.content.problem)
                setFailure({ code: event.assistant.content.problem, retry: message });
            } else {
              setMessages((m) => m.filter((x) => x.id !== temp.id));
              setFailure({ code: event.code, retry: message });
            }
          }
        }
      } catch {
        if (abort.signal.aborted) {
          setMessages((m) => m.filter((x) => x.id !== temp.id));
          setText(message); // nothing was lost: it is back in the box
          setAnnounce(t("announce.cancelled"));
        } else {
          setMessages((m) => m.filter((x) => x.id !== temp.id));
          setFailure({ code: "NETWORK", retry: message });
        }
      } finally {
        setSending(false);
        setStatus(null);
        controller.current = null;
        inputRef.current?.focus();
      }
    },
    [conversationId, context.planId, context.planTitle, router, sending, sportKey, t],
  );

  const replaceMessage = (next: MessageDto) =>
    setMessages((m) => m.map((x) => (x.id === next.id ? next : x)));

  async function apply(message: MessageDto, proposal: Proposal, confirmed: boolean) {
    setApplying(proposal.id);
    const result = await applyProposalAction({
      messageId: message.id,
      proposalId: proposal.id,
      confirmed,
    });
    setApplying(null);
    if (result.ok) {
      replaceMessage(result.data.message);
      toast(t("proposal.appliedToast"), "success");
      setAnnounce(t("proposal.appliedToast"));
      if (proposal.kind === "create_session" && result.data.planId)
        router.push(`/sessions/${sportKey}/${result.data.planId}`);
      else router.refresh();
      return;
    }
    // the server records a failure in the message; read it back by re-rendering from what it stored
    const code = result.error.code;
    setMessages((m) =>
      m.map((x) =>
        x.id === message.id
          ? {
              ...x,
              content: {
                ...x.content,
                proposals: x.content.proposals.map((p) =>
                  p.id === proposal.id && code !== "VALIDATION"
                    ? ({ ...p, status: "failed", error: code } as Proposal)
                    : p,
                ),
              },
            }
          : x,
      ),
    );
  }

  async function dismiss(message: MessageDto, proposal: Proposal) {
    const result = await dismissProposalAction({ messageId: message.id, proposalId: proposal.id });
    if (result.ok) replaceMessage(result.data.message);
  }

  async function remove(id: string) {
    const result = await deleteConversationAction(id);
    if (result.ok) {
      toast(t("history.deleted"), "success");
      if (id === conversationId)
        router.push(`/assistant/${sportKey}${context.planId ? `?plan=${context.planId}` : ""}`);
      else router.refresh();
    }
  }

  const failureText = (code: string) =>
    t.has(`problems.${code}`) ? t(`problems.${code}`) : te.has(code) ? te(code) : te("generic");

  const prompts: Array<{ key: string; text: string; needsSession: boolean }> = [
    { key: "create", text: t("prompts.create.text"), needsSession: false },
    { key: "harder", text: t("prompts.harder.text"), needsSession: true },
    { key: "easier", text: t("prompts.easier.text"), needsSession: true },
    { key: "shorten", text: t("prompts.shorten.text"), needsSession: true },
    { key: "game", text: t("prompts.game.text"), needsSession: true },
    { key: "diagram", text: t("prompts.diagram.text"), needsSession: true },
    { key: "validate", text: t("prompts.validate.text"), needsSession: true },
    { key: "explain", text: t("prompts.explain.text"), needsSession: false },
  ];

  const toolLabel =
    status?.type === "status" &&
    status.phase === "tool" &&
    status.tool &&
    t.has(`status.tools.${status.tool}`)
      ? t(`status.tools.${status.tool}`)
      : t("status.thinking");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0 space-y-4">
        <ContextBar sportKey={sportKey} context={context} sessions={sessions} />

        <Card>
          <CardBody className="space-y-4">
            <div
              role="log"
              aria-label={t("log")}
              aria-live="polite"
              aria-relevant="additions"
              className="max-h-[60vh] min-h-56 space-y-4 overflow-y-auto pr-1"
              data-testid="chat-log"
            >
              {messages.length === 0 ? (
                <div className="space-y-3 py-6 text-center" data-testid="chat-empty">
                  <Sparkles className="mx-auto size-8 text-accent" aria-hidden />
                  <p className="text-base font-medium text-ink">{t("empty.title")}</p>
                  <p className="mx-auto max-w-md text-sm text-ink-muted">{t("empty.body")}</p>
                </div>
              ) : null}
              {messages.map((m) => (
                <MessageView
                  key={m.id}
                  message={m}
                  sportKey={sportKey}
                  applying={applying}
                  onApply={(p, confirmed) => void apply(m, p, confirmed)}
                  onDismiss={(p) => void dismiss(m, p)}
                />
              ))}
              {sending ? (
                <div
                  className="flex animate-fade-up items-center gap-3 text-sm text-ink-muted"
                  role="status"
                  data-testid="chat-working"
                >
                  <TypingDots />
                  {/* Keyed on the label, so each phase change (thinking → a named tool → thinking again)
                      crossfades instead of snapping — the wording always reflects real stream events. */}
                  <span key={toolLabel} className="animate-fade-in">
                    {toolLabel}
                  </span>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>

            {failure ? (
              <div
                role="alert"
                className="flex animate-fade-up flex-wrap items-center gap-3 rounded-md border border-danger bg-danger-soft p-3 text-sm text-ink"
                data-testid="chat-error"
              >
                <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden />
                <span className="min-w-0 flex-1">{failureText(failure.code)}</span>
                {failure.code !== "daily_limit" &&
                failure.code !== "UNAVAILABLE" &&
                failure.code !== "FORBIDDEN" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void send(failure.retry)}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                    {t("retry")}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2" aria-label={t("prompts.heading")} role="group">
              {prompts
                .filter((p) => !p.needsSession || context.planId)
                .map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    disabled={sending}
                    onClick={() => void send(p.text)}
                    className="press rounded-full border border-line-strong bg-surface-raised px-3 py-1.5 text-sm text-ink smooth-colors hover:bg-surface-sunken disabled:opacity-55"
                  >
                    {t(`prompts.${p.key}.label`)}
                  </button>
                ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
              className="space-y-2"
            >
              <label htmlFor="assistant-input" className="sr-only">
                {t("composer.label")}
              </label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                value={text}
                maxLength={MAX}
                rows={3}
                disabled={sending}
                placeholder={t("composer.placeholder")}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                className="focus-visible:outline-focus block w-full rounded-md border border-line-strong bg-surface-raised px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus-visible:border-accent focus-visible:outline-2 disabled:opacity-60"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-ink-muted">
                  {t("composer.hint", { count: text.length, max: MAX })}
                </p>
                <div className="flex gap-2">
                  {sending ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => controller.current?.abort()}
                    >
                      <Square className="size-4" aria-hidden />
                      {t("cancel")}
                    </Button>
                  ) : null}
                  <Button type="submit" disabled={sending || text.trim().length === 0}>
                    <SendHorizontal className="size-4" aria-hidden />
                    {t("composer.send")}
                  </Button>
                </div>
              </div>
            </form>
          </CardBody>
        </Card>
        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>

      <aside aria-labelledby="assistant-history" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="assistant-history" className="flex items-center gap-1.5 eyebrow">
            <History className="size-4" aria-hidden />
            {t("history.heading")}
          </h2>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/assistant/${sportKey}${context.planId ? `?plan=${context.planId}` : ""}`}>
              <Plus className="size-4" aria-hidden />
              {t("history.new")}
            </Link>
          </Button>
        </div>
        {conversations.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("history.empty")}</p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id} className="flex items-center gap-1">
                <Link
                  href={`/assistant/${sportKey}?c=${c.id}${c.planId ? `&plan=${c.planId}` : ""}`}
                  aria-current={c.id === conversationId ? "page" : undefined}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-md px-3 py-2 text-sm smooth-colors hover:bg-surface-sunken",
                    c.id === conversationId
                      ? "bg-accent-soft font-semibold text-ink"
                      : "text-ink-muted",
                  )}
                >
                  {c.title || t("history.untitled")}
                </Link>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0"
                  aria-label={t("history.delete", { title: c.title || t("history.untitled") })}
                  onClick={() => void remove(c.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function ContextBar({
  sportKey,
  context,
  sessions,
}: {
  sportKey: string;
  context: ChatContext;
  sessions: SessionChoice[];
}) {
  const tx = useTranslations("assistant.context");
  const router = useRouter();
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3"
      data-testid="chat-context"
    >
      <p className="text-sm text-ink">
        {context.planId && context.planTitle ? (
          <>
            {tx("working")}{" "}
            <Link
              href={`/sessions/${sportKey}/${context.planId}`}
              className="font-semibold underline-offset-2 hover:underline"
            >
              {context.planTitle}
            </Link>
            <span className="text-ink-muted">
              {" "}
              · {tx("activities", { count: context.activityCount })}
            </span>
          </>
        ) : (
          <span className="text-ink-muted">{tx("none")}</span>
        )}
      </p>
      {sessions.length > 0 ? (
        <div className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto">
          <label htmlFor="assistant-session" className="text-sm text-ink-muted">
            {tx("choose")}
          </label>
          <Select
            id="assistant-session"
            className="h-9 w-full min-w-0 text-sm sm:w-56"
            value={context.planId ?? ""}
            onChange={(e) =>
              router.push(
                `/assistant/${sportKey}${e.target.value ? `?plan=${e.target.value}` : ""}`,
              )
            }
          >
            <option value="">{tx("noSession")}</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </div>
  );
}

function MessageView({
  message,
  sportKey,
  applying,
  onApply,
  onDismiss,
}: {
  message: MessageDto;
  sportKey: string;
  applying: string | null;
  onApply: (p: Proposal, confirmed: boolean) => void;
  onDismiss: (p: Proposal) => void;
}) {
  const tm = useTranslations("assistant.message");
  const mine = message.role === "user";
  const { text, proposals, sources } = message.content;
  return (
    <div
      className={cn("flex animate-fade-up", mine ? "justify-end" : "justify-start")}
      data-role={message.role}
    >
      <div
        className={cn(
          "max-w-[92%] space-y-3 rounded-lg px-4 py-3 sm:max-w-[85%]",
          mine ? "bg-accent text-accent-ink" : "border border-line bg-surface-raised text-ink",
        )}
      >
        {!mine ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <Sparkles className="size-3" aria-hidden />
            {tm("assistant")}
          </p>
        ) : null}
        {text ? (
          <p className="text-base leading-relaxed break-words whitespace-pre-wrap">{text}</p>
        ) : null}
        {!mine && sources.length > 0 ? (
          <p className="text-xs text-ink-muted" data-testid="chat-sources">
            {tm("sources")}{" "}
            {sources.map((s, i) => (
              <React.Fragment key={s.drillId}>
                {i > 0 ? ", " : ""}
                <Link
                  href={`/sports/${sportKey}/drills/${s.drillId}`}
                  className="underline underline-offset-2"
                >
                  {s.title}
                </Link>
              </React.Fragment>
            ))}
          </p>
        ) : null}
        {proposals.map((p) => (
          <ProposalCard
            key={p.id}
            sportKey={sportKey}
            proposal={p}
            busy={applying !== null}
            onApply={(confirmed) => onApply(p, confirmed)}
            onDismiss={() => onDismiss(p)}
          />
        ))}
      </div>
    </div>
  );
}
