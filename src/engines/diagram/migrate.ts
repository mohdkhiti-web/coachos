import type { z } from "zod";
import { DIAGRAM_SCHEMA_VERSION, MAX_DIAGRAM_BYTES, diagramSchema, type Diagram } from "./schema";

/**
 * Stored diagrams carry `schemaVersion`. Every read passes through `migrateDiagram()` so rows written
 * by older versions keep working (ARCHITECTURE.md §4.4). Only v1 exists today; when v2 arrives, add
 * the v1→v2 step here and bump DIAGRAM_SCHEMA_VERSION — migration must stay TOTAL for all older versions.
 */
export function migrateDiagram(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === DIAGRAM_SCHEMA_VERSION) return raw;
  return raw; // unknown versions fall through to the schema, which rejects them with a clear error
}

export type ParsedDiagram =
  { success: true; data: Diagram } | { success: false; error: z.ZodError };

export function parseDiagram(raw: unknown): ParsedDiagram {
  if (typeof raw === "object" && raw !== null && JSON.stringify(raw).length > MAX_DIAGRAM_BYTES) {
    // Represented as a schema failure so callers have one error path.
    const r = diagramSchema.safeParse(null);
    if (!r.success) return { success: false, error: r.error };
  }
  const r = diagramSchema.safeParse(migrateDiagram(raw));
  return r.success ? { success: true, data: r.data } : { success: false, error: r.error };
}
