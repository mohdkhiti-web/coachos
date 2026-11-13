import { cn } from "@/lib/cn";

/**
 * The top of a page: the title carries its own weight (no kicker above it), a short description, the page's
 * primary actions on the right, and an optional `meta` row under the description for context such as the sport
 * workspace or a count. One component so every page opens the same way.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  size = "lg",
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        <h1
          className={cn(
            "display text-ink",
            size === "lg" ? "text-[2.6rem] sm:text-5xl" : "text-4xl sm:text-[2.6rem]",
          )}
        >
          {title}
        </h1>
        {description ? <p className="max-w-2xl text-base text-ink-muted">{description}</p> : null}
        {meta ? <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A small boxed context tag (the sport workspace, a count): printed-form style, never a kicker. */
export function MetaTag({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "accent";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[5px] border px-2.5 text-[0.8rem] font-semibold",
        tone === "accent"
          ? "border-accent/30 bg-accent-soft text-accent"
          : "border-line bg-surface-raised text-ink-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
