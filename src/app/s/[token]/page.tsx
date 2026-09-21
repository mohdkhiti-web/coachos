import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SharedSessionView } from "@/components/features/sharing/shared-session";
import { clientIp } from "@/modules/identity";
import { isPdfExportAvailable } from "@/modules/exports";
import { resolveShare } from "@/modules/sharing";
import { publicPageRate } from "@/modules/sharing/public-limits";

/**
 * GET /s/[token] — a session shared read-only (Step 7). No sign-in. Every way a link can be unusable (unknown, forged,
 * revoked, expired, the session deleted or archived) is the same "not available" page, so a visitor learns nothing
 * about which. What is shown is the document and nothing about the workspace behind it.
 */
export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const shared = await resolveShare(token);
  return { title: shared ? shared.title : "Shared session" };
}

export default async function SharedPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  if (!publicPageRate.allow(clientIp(await headers()) ?? "unknown")) notFound();
  const shared = await resolveShare(token);
  if (!shared) notFound();
  return (
    <SharedSessionView
      token={token}
      title={shared.title}
      input={shared.input}
      design={shared.design}
      reflection={shared.reflection}
      expiresAt={shared.expiresAt}
      pdfAvailable={isPdfExportAvailable()}
    />
  );
}
