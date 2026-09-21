import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { mediaAssets } from "@/db/schema";
import { can, type Actor } from "@/lib/authz/can";
import type { Tx } from "@/lib/db/client";
import { inTx } from "@/lib/db/in-tx";
import { newId } from "@/lib/ids";
import { RateWindow } from "@/lib/limits";
import { fail, ok, type Result } from "@/lib/result";
import { recordAuditInTx } from "@/modules/audit";
import type { LogoDto } from "./dto";
import { logoLabel, inspectLogo, MAX_LOGO_BYTES } from "./image";
import { toLogoDto } from "./queries";

/**
 * Logos (Step 7). Uploading is the one place where a stranger's bytes enter the system, so every step is explicit:
 * may this person author here → are they asking too often → is the file a logo (signature, structure, size, dimensions,
 * safe SVG) and stripped of metadata → is the workspace within its limit → store, audit. The stored file is what
 * `inspectLogo` produced, never the upload itself.
 */

export const MAX_LOGOS_PER_WORKSPACE = 20;
const UPLOADS_PER_MINUTE = 10;

const uploads = new RateWindow(UPLOADS_PER_MINUTE, 60_000);

/** Validation message keys (`validation.*`) for each way a file can be refused. */
const REASON_KEY: Record<string, string> = {
  empty: "logo_empty",
  too_large: "logo_too_large",
  unsupported_type: "logo_type",
  corrupt: "logo_corrupt",
  dimensions: "logo_dimensions",
  svg_not_svg: "logo_corrupt",
  svg_too_large: "logo_too_large",
  svg_malformed: "logo_corrupt",
  svg_forbidden_element: "logo_svg_unsafe",
  svg_forbidden_attribute: "logo_svg_unsafe",
  svg_forbidden_value: "logo_svg_unsafe",
  svg_too_complex: "logo_svg_complex",
  svg_no_size: "logo_svg_size",
};

export async function uploadLogo(
  actor: Actor,
  input: { fileName: string; bytes: Uint8Array },
): Promise<Result<LogoDto>> {
  if (!can(actor, "logo:create", { organizationId: actor.organizationId }))
    return fail("FORBIDDEN");
  if (!uploads.allow(actor.userId)) return fail("RATE_LIMITED");
  if (input.bytes.length > MAX_LOGO_BYTES)
    return fail("VALIDATION", { fields: { file: ["logo_too_large"] } });

  const inspected = inspectLogo(input.bytes);
  if (!inspected.ok)
    return fail("VALIDATION", {
      fields: { file: [REASON_KEY[inspected.reason] ?? "logo_corrupt"] },
    });

  return inTx(actor, async (tx) => {
    // the same picture uploaded twice is one logo
    const [same] = await tx
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.organizationId, actor.organizationId),
          eq(mediaAssets.sha256, inspected.sha256),
          isNull(mediaAssets.deletedAt),
        ),
      )
      .limit(1);
    if (same) return ok(toLogoDto(actor, same));

    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(mediaAssets)
      .where(
        and(eq(mediaAssets.organizationId, actor.organizationId), isNull(mediaAssets.deletedAt)),
      );
    if (n >= MAX_LOGOS_PER_WORKSPACE)
      return fail("VALIDATION", { fields: { file: ["logo_limit"] } });

    const id = newId();
    const [row] = await tx
      .insert(mediaAssets)
      .values({
        id,
        organizationId: actor.organizationId,
        kind: "logo",
        mime: inspected.mime,
        name: logoLabel(input.fileName),
        width: inspected.width,
        height: inspected.height,
        byteSize: inspected.bytes.length,
        sha256: inspected.sha256,
        data: inspected.bytes,
        createdBy: actor.userId,
      })
      .returning();
    await recordAuditInTx(tx, actor, {
      action: "media.logo_uploaded",
      entityType: "media",
      entityId: id,
      metadata: { mime: inspected.mime, bytes: inspected.bytes.length },
    });
    return ok(toLogoDto(actor, row!));
  });
}

/** Delete (soft). Designs that still point at it simply print without a logo. */
export async function deleteLogo(actor: Actor, id: string): Promise<Result<{ id: string }>> {
  return inTx(actor, async (tx) => {
    const [row] = await tx
      .select({
        id: mediaAssets.id,
        organizationId: mediaAssets.organizationId,
        createdBy: mediaAssets.createdBy,
      })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .limit(1);
    if (!row) return fail("NOT_FOUND");
    if (!can(actor, "logo:delete", { ...row, visibility: "organization" }))
      return fail("FORBIDDEN");
    await tx.update(mediaAssets).set({ deletedAt: new Date() }).where(eq(mediaAssets.id, id));
    await recordAuditInTx(tx, actor, {
      action: "media.logo_deleted",
      entityType: "media",
      entityId: id,
    });
    return ok({ id });
  });
}

/**
 * May a design point at this image? It must be a live logo this person can read (their own workspace's). Used by every
 * command that stores a design, so a design can never reference another workspace's picture.
 */
export async function logoIsUsable(tx: Tx, id: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
    .limit(1);
  return Boolean(row);
}

/** For tests: forget the upload rate history. */
export const resetUploadRate = () => {
  (uploads as unknown as { hits: Map<string, number[]> }).hits.clear();
};
