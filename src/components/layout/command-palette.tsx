"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as D } from "radix-ui";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  CornerDownLeft,
  LayoutDashboard,
  LayoutTemplate,
  Loader2,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { quickSearchAction, type QuickResult } from "@/modules/search/actions";

type Item = {
  key: string;
  group: "goTo" | "drills" | "sessions";
  label: string;
  sub?: string;
  href: string;
  icon: LucideIcon;
};

/**
 * The command palette (Ctrl/⌘ K, or the Search button in the top bar). Jumps to any page, and searches the real drill
 * library and the coach's sessions through the same queries the app uses (row-level security applies). Opened
 * dozens of times a day, so it opens and closes with NO animation, and the keyboard does everything.
 */
export function CommandPalette({ sport, assistant }: { sport: string; assistant: boolean }) {
  const t = useTranslations("palette");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<QuickResult>({ drills: [], sessions: [] });
  const [searching, setSearching] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // debounced search: state is only ever set from the timer / the resolved promise, never synchronously
  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let stale = false;
    const id = window.setTimeout(() => {
      setSearching(true);
      quickSearchAction({ sport, q: term })
        .then((r) => {
          if (!stale) setResults(r);
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, 180);
    return () => {
      stale = true;
      window.clearTimeout(id);
    };
  }, [q, sport]);

  const pages: Item[] = [
    { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
    { key: "newSession", href: `/sessions/${sport}/new`, icon: Plus },
    { key: "generate", href: `/sessions/${sport}/generate`, icon: Wand2 },
    { key: "sessions", href: `/sessions/${sport}`, icon: ClipboardList },
    { key: "drills", href: `/sports/${sport}/drills`, icon: BookOpen },
    { key: "newDrill", href: `/sports/${sport}/drills/new`, icon: Plus },
    ...(assistant ? [{ key: "assistant", href: `/assistant/${sport}`, icon: Sparkles }] : []),
    { key: "templates", href: `/templates/${sport}`, icon: LayoutTemplate },
    { key: "roster", href: "/roster", icon: Users },
    { key: "settings", href: "/settings", icon: Settings },
  ].map((p) => ({ ...p, group: "goTo" as const, label: t(`pages.${p.key}`) }));

  const term = q.trim().toLowerCase();
  const showResults = term.length >= 2;
  const items: Item[] = [
    ...pages.filter((p) => !term || p.label.toLowerCase().includes(term)),
    ...(showResults
      ? results.drills.map((d) => ({
          key: `d-${d.id}`,
          group: "drills" as const,
          label: d.title,
          sub: d.category,
          href: `/sports/${sport}/drills/${d.id}`,
          icon: BookOpen,
        }))
      : []),
    ...(showResults
      ? results.sessions.map((s) => ({
          key: `s-${s.id}`,
          group: "sessions" as const,
          label: s.title,
          sub: [s.team, t("minutes", { count: s.minutes })].filter(Boolean).join(" · "),
          href: `/sessions/${sport}/${s.id}`,
          icon: ClipboardList,
        }))
      : []),
  ];
  const current = Math.min(active, Math.max(0, items.length - 1));

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % Math.max(1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[current]);
    }
  }

  const groups = (["goTo", "drills", "sessions"] as const).filter((g) =>
    items.some((i) => i.group === g),
  );

  return (
    <D.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQ("");
          setActive(0);
          setResults({ drills: [], sessions: [] });
        }
      }}
    >
      <D.Trigger asChild>
        <button
          type="button"
          aria-label={t("openLabel")}
          className="inline-flex h-10 press items-center gap-2 rounded-md border border-line bg-surface-raised px-2.5 text-sm text-ink-muted smooth-colors hover:border-line-strong hover:text-ink sm:min-w-52 sm:px-3"
        >
          <Search className="size-4" aria-hidden />
          <span className="hidden sm:inline">{t("open")}</span>
          <kbd className="ml-auto hidden rounded-[4px] border border-line-strong px-1.5 py-px font-sans text-[0.7rem] text-ink-muted sm:inline">
            Ctrl K
          </kbd>
        </button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[80] bg-overlay" />
        <D.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-[81] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-pop"
        >
          <D.Title className="sr-only">{t("title")}</D.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            {searching ? (
              <Loader2 className="size-5 shrink-0 animate-spin text-ink-muted" aria-hidden />
            ) : (
              <Search className="size-5 shrink-0 text-ink-muted" aria-hidden />
            )}
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
                if (e.target.value.trim().length < 2) setResults({ drills: [], sessions: [] });
              }}
              onKeyDown={onInputKey}
              placeholder={t("placeholder")}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={items[current] ? `${listId}-${items[current].key}` : undefined}
              aria-label={t("title")}
              className="h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
            />
          </div>

          <div
            id={listId}
            role="listbox"
            aria-label={t("title")}
            className="max-h-[56vh] overflow-y-auto p-2"
          >
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-ink-muted">
                {searching ? t("searching") : t("none", { q: q.trim() })}
              </p>
            ) : (
              groups.map((g) => (
                <div key={g} role="group" aria-label={t(g)} className="pb-1">
                  <p className="px-3 pt-2 pb-1.5 text-xs font-semibold text-ink-muted">{t(g)}</p>
                  {items
                    .filter((i) => i.group === g)
                    .map((item) => {
                      const i = items.indexOf(item);
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.key}
                          id={`${listId}-${item.key}`}
                          role="option"
                          aria-selected={i === current}
                          onMouseMove={() => i !== current && setActive(i)}
                          onClick={() => go(item)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5",
                            i === current ? "bg-surface-sunken text-ink" : "text-ink",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0",
                              i === current ? "text-accent" : "text-ink-muted",
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{item.label}</span>
                            {item.sub ? (
                              <span className="block truncate text-xs text-ink-muted">
                                {item.sub}
                              </span>
                            ) : null}
                          </span>
                          {i === current ? (
                            <CornerDownLeft
                              className="size-4 shrink-0 text-ink-muted"
                              aria-hidden
                            />
                          ) : (
                            <ArrowRight className="size-4 shrink-0 text-transparent" aria-hidden />
                          )}
                        </div>
                      );
                    })}
                </div>
              ))
            )}
          </div>
          <p className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">{t("hint")}</p>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
