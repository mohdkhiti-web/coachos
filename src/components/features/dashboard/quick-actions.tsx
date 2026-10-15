import Link from "next/link";
import {
  ArrowUpRight,
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
 * The coach's shortcuts. Every tile goes somewhere that works today: nothing here points at a feature that does not
 * exist yet (the AI Coach tile only appears when the assistant is actually set up on this server).
 */
export async function QuickActions({
  sportKey,
  assistant,
}: {
  sportKey: string;
  assistant: boolean;
}) {
  const t = await getTranslations("dashboard.cc.quick");
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
    <section aria-labelledby="quick-actions">
      <h2 id="quick-actions" className="sr-only">
        {t("title")}
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {actions.map(({ key, href, icon: Icon, primary }, i) => (
          <li
            key={key}
            className="rise"
            style={{ "--rise-delay": `${i * 60}ms` } as React.CSSProperties}
          >
            <Link
              href={href}
              className={cn(
                "group relative flex h-full interactive-surface flex-col gap-3 overflow-hidden rounded-xl border p-4 shadow-paper",
                primary
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line bg-surface-raised text-ink",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-lg",
                  primary ? "bg-accent-ink/15" : "bg-accent-soft text-accent",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="block">
                <span className="block text-base font-semibold tracking-tight">
                  {t(`${key}.title`)}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-sm",
                    primary ? "text-accent-ink" : "text-ink-muted",
                  )}
                >
                  {t(`${key}.body`)}
                </span>
              </span>
              <ArrowUpRight
                aria-hidden
                className="absolute top-4 right-4 size-4 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
