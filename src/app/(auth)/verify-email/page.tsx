import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VerifyEmailPanel } from "@/components/features/auth/verify-email-panel";
import { getViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Verify your email" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  // After a successful verification link, Better Auth signs the user in and lands here → dashboard.
  if (await getViewer()) redirect("/dashboard");

  const sp = await searchParams;
  const email = first(sp.email)?.slice(0, 254);
  const mode = first(sp.error) ? "invalid" : first(sp.unverified) ? "unverified" : "sent";

  return <VerifyEmailPanel email={email} mode={mode} />;
}
