import { cn } from "@/lib/cn";

/**
 * Numbered section marker ("01 —"). The signature detail of the Playbook identity: it will appear
 * identically in printed documents later, so screen and paper share one visual language (§2.2).
 */
export function SectionMarker({
  n,
  children,
  className,
}: {
  n: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("flex items-center gap-3 eyebrow", className)}>
      <span className="numeral text-accent">{String(n).padStart(2, "0")}</span>
      <span aria-hidden className="h-px w-6 bg-line-strong" />
      <span>{children}</span>
    </p>
  );
}
