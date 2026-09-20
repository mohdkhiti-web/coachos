import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/features/auth/forgot-password-form";
import { getViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  if (await getViewer()) redirect("/settings/security");
  return <ForgotPasswordForm />;
}
