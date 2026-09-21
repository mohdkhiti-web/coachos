import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { LogoMime } from "@/db/enums";
import { mediaAssets } from "@/db/schema";
import { can, type Actor } from "@/lib/authz/can";
import { shareTx, tenantTx } from "@/lib/db/tx";
import { isUuid } from "@/lib/ids";
import { logoUrl, type LogoDto, type LogoFile } from "./dto";

type Row = typeof mediaAssets.$inferSelect;

export function toLogoDto(actor: Actor, r: Omit<Row, "data"> | Row): LogoDto {
  return {
    id: r.id,
    name: r.name,
    mime: r.mime as LogoMime,
    width: r.width,
    height: r.height,
    byteSize: r.byteSize,
    createdAt: r.createdAt,
    isMine: r.createdBy === actor.userId,
    canDelete: can(actor, "logo:delete", {
      organizationId: r.organizationId,
      createdBy: r.createdBy,
      visibility: "organization",
    }),
    url: logoUrl(r.id),
  };
}

/** The workspace's logos, newest first (the bytes are not loaded). */
export async function listLogos(actor: Actor): Promise<LogoDto[]> {
  return tenantTx(actor, async (tx) => {
    const rows = await tx
      .select({
        id: mediaAssets.id,
        organizationId: mediaAssets.organizationId,
        name: mediaAssets.name,
        mime: mediaAssets.mime,
        width: mediaAssets.width,
        height: mediaAssets.height,
        byteSize: mediaAssets.byteSize,
        createdBy: mediaAssets.createdBy,
        createdAt: mediaAssets.createdAt,
      })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.kind, "logo"), isNull(mediaAssets.deletedAt)))
      .orderBy(desc(mediaAssets.createdAt))
      .limit(50);
    return rows.map((r) => toLogoDto(actor, { ...r, kind: "logo", sha256: "", deletedAt: null }));
  });
}

const fileOf = (r: Pick<Row, "mime" | "data" | "sha256">): LogoFile => ({
  mime: r.mime as LogoMime,
  bytes: r.data,
  sha256: r.sha256,
});

/** One logo's bytes for a signed-in member of its workspace; null when it is not there FOR THEM. */
export async function readLogo(actor: Actor, id: string): Promise<LogoFile | null> {
  if (!isUuid(id)) return null;
  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .limit(1);
    return row ? fileOf(row) : null;
  });
}

/**
 * One logo's bytes for a PUBLIC visitor of a share: readable only while the share is live and only for the workspace
 * of the shared session. (The caller checks that the shared session's design actually uses this image.)
 */
export async function readSharedLogo(shareId: string, id: string): Promise<LogoFile | null> {
  if (!isUuid(id)) return null;
  return shareTx(shareId, async (tx) => {
    const [row] = await tx
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .limit(1);
    return row ? fileOf(row) : null;
  });
}
