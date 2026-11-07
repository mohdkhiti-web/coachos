import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ClipboardPlus,
  LayoutTemplate,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";

/**
 * The coach's shortcuts as one ruled list beside the court panel. Every row goes somewhere that works today (the AI
 * Coach row only exists when the assistant is set up on this server). Building a session leads, in the coach's orange.
 */
export async function QuickActions({
  sportKey,
  sportName,
  assistant,
}: {
  sportKey: string;
  sportName: string;
  assistant: boolean;
}) {
  const [t, tc] = await Promise.all([
    getTranslations("dashboard.cc.quick"),
    getTranslations("dashboard.cc.court"),
  ]);
  const actions: Array<{
    key: "build" | "generate" | "ai" | "drills" | "templates";
    href: string;
    icon: LucideIcon;
    primary?: boolean;
  }> = [
    { key: "build", href: `/sessions/${sportKey}/new`, icon: ClipboardPlus, primary: true },
    { key: "generate", href: `/sessions/${sportKey}/generate`, icon: Wand2 },
    ...(assistant ? [{ key: "ai" as const, href: `/assistant/${sportKey}`, icon: Sparkles }] : []),
    { key: "drills", href: `/sports/${sportKey}`, icon: BookOpen },
    { key: "templates", href: `/templates/${sportKey}`, icon: LayoutTemplate },
  ];

  return (
    <section
      aria-labelledby="quick-actions"
      className="overflow-hidden rounded-xl border border-line bg-surface-raised shadow-paper"
    >
      <header className="border-b border-line px-5 py-3">
        <h2 id="quick-actions" className="eyebrow">
          {tc("actionsTitle")}
        </h2>
      </header>
      <ul className="divide-y divide-line">
        {actions.map(({ key, href, icon: Icon, primary }) => (
          <li key={key}>
            <Link
              href={href}
              className={cn(
                "group flex items-center gap-4 px-5 py-3.5 smooth-colors",
                primary
                  ? "bg-accent text-accent-ink hover:bg-accent-strong"
                  : "hover:bg-surface-sunken",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-9 shrink-0 items-center justify-center rounded-md",
                  primary ? "bg-black/15" : "border border-line bg-surface text-accent",
                )}
              >
                <Icon className="size-[1.1rem]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t(`${key}.title`)}</span>
                <span
                  className={cn(
                    "block truncate text-sm",
                    primary ? "text-accent-ink" : "text-ink-muted",
                  )}
                >
                  {t(`${key}.body`, { sport: sportName })}
                </span>
              </span>
              <ArrowRight
                aria-hidden
                className={cn(
                  "size-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-1",
                  primary ? "" : "text-ink-faint group-hover:text-ink",
                )}
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
