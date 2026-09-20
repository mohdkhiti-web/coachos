import { cn } from "@/lib/cn";

/**
 * Numbered section marker ("01 —"). The signature detail of the Playbook identity: it will appear
 * identically in printed documents later, so screen and paper share one visual language (§2.2).
 * Pass `as="h2" | "h3"` (and an `id`) when it is the heading of a section — one element, one read-out.
 */
export function SectionMarker({
  n,
  children,
  className,
  as: Tag = "p",
  id,
}: {
  n: number;
  children: React.ReactNode;
  className?: string;
  as?: "p" | "h2" | "h3";
  id?: string;
}) {
  return (
    <Tag id={id} className={cn("flex items-center gap-3 eyebrow", className)}>
      <span className="numeral text-accent">{String(n).padStart(2, "0")}</span>
      <span aria-hidden className="h-px w-6 bg-line-strong" />
      <span>{children}</span>
    </Tag>
  );
}
