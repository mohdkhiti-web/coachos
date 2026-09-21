import "server-only";
import { eq } from "drizzle-orm";
import { planShares } from "@/db/schema";
import { shareTx } from "@/lib/db/tx";
import {
  emptyReflection,
  resolveSessionDesign,
  type DocumentDesign,
  type Reflection,
  type SessionDocumentInput,
} from "@/modules/documents";
import { readSharedLogo, type LogoFile } from "@/modules/media";
import { getSharedPlan, toDocumentInput, type PlanDetailDto } from "@/modules/plans";
import { shareSecret } from "./secret";
import { parseShareToken } from "./token";

/**
 * What a PUBLIC visitor to a share link may see (Step 7). The token is verified first (signature, before any database
 * work); then everything is read inside `shareTx`, where the database itself opens only the one live session the link
 * names. What comes out is a `SharedSession`: the document and nothing about the workspace behind it.
 */

export interface SharedSession {
  shareId: string;
  title: string;
  sportKey: string;
  /** The document's input, with the session's private notes removed. */
  input: SessionDocumentInput;
  /** The design as the session prints, minus the sections that are private (coach notes, reflection). */
  design: DocumentDesign;
  reflection: Reflection;
  expiresAt: Date | null;
  /** For the PDF's properties (already printed on the document). */
  meta: { author: string; subject: string; keywords: string[] };
}

/**
 * The public view of a session: what its document shows, except what is private to the coach. Coach notes and the
 * reflection are never shared, whatever the design switches on; nothing else is added.
 */
export function publicView(plan: PlanDetailDto): {
  input: SessionDocumentInput;
  design: DocumentDesign;
  reflection: Reflection;
} {
  const design = resolveSessionDesign(plan.documentSettings);
  return {
    input: { ...toDocumentInput(plan), coachNotes: "" },
    design: { ...design, sections: { ...design.sections, coachNotes: false, reflection: false } },
    reflection: emptyReflection(),
  };
}

/** The session a link names, or null for every way a link can be unusable (unknown, forged, revoked, expired, session gone) — one answer, so nothing is revealed. */
export async function resolveShare(token: unknown): Promise<SharedSession | null> {
  const shareId = parseShareToken(token, shareSecret());
  if (!shareId) return null;
  const share = await shareTx(shareId, async (tx) => {
    const [row] = await tx.select().from(planShares).where(eq(planShares.id, shareId)).limit(1);
    return row ?? null;
  });
  if (!share || share.revokedAt !== null) return null;
  if (share.expiresAt !== null && share.expiresAt.getTime() <= Date.now()) return null;

  // the database opens the session only while the link is live and the session is (not deleted, not archived)
  const plan = await getSharedPlan(shareId, share.planId);
  if (!plan) return null;
  const view = publicView(plan);
  return {
    shareId,
    title: plan.title,
    sportKey: plan.sportKey,
    ...view,
    expiresAt: share.expiresAt,
    meta: {
      author: plan.details.coachName,
      subject:
        [plan.ageGroup?.name, plan.teamName].filter(Boolean).join(" · ") + " · training session",
      keywords: [plan.objectives.primary, ...plan.objectives.secondary].flatMap((o) =>
        o ? [o.name] : [],
      ),
    },
  };
}

/** The logo a shared session's design uses — and only that one. */
export async function readShareLogo(token: unknown, assetId: string): Promise<LogoFile | null> {
  const shared = await resolveShare(token);
  if (!shared || shared.design.logo?.assetId !== assetId) return null;
  return readSharedLogo(shared.shareId, assetId);
}
