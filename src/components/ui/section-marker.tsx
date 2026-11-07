import { cn } from "@/lib/cn";

/**
 * A small printed section label: condensed caps with a short orange tick, the way a scoresheet labels its blocks.
 * `n` is kept for existing callers but no longer printed: section numbers carry no information here.
 * Pass `as="h2" | "h3"` (and an `id`) when it is the heading of a section — one element, one read-out.
 */
export function SectionMarker({
  children,
  className,
  as: Tag = "p",
  id,
}: {
  n?: number;
  children: React.ReactNode;
  className?: string;
  as?: "p" | "h2" | "h3";
  id?: string;
}) {
  return (
    <Tag id={id} className={cn("flex items-center gap-2.5 eyebrow", className)}>
      <span aria-hidden className="h-[3px] w-4 rounded-full bg-accent-bright" />
      <span>{children}</span>
    </Tag>
  );
}
