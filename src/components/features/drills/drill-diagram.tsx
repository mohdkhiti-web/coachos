import { DiagramView, type Diagram, type DiagramTheme } from "@/engines/diagram";
import { getCourtPack } from "@/sports/registry";

/**
 * A diagram on a page: resolves the court pack from the diagram's own sport/court reference. Pure and
 * environment-agnostic (server or client component), so the exact same drawing feeds drill cards,
 * the detail page, the editor preview, and — later — session builders and exports.
 */
export function DrillDiagram({
  diagram,
  title,
  decorative = false,
  className,
  theme,
}: {
  diagram: Diagram;
  title?: string;
  decorative?: boolean;
  className?: string;
  /** `print` = fixed colours (a page of paper never follows the app's light/dark theme). Default: the app's own. */
  theme?: DiagramTheme;
}) {
  const pack = getCourtPack(diagram.sport, diagram.court);
  if (!pack) return null;
  return (
    <DiagramView
      diagram={diagram}
      pack={pack}
      title={title}
      decorative={decorative}
      className={className}
      theme={theme}
    />
  );
}
