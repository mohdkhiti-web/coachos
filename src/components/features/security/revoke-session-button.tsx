"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { revokeSessionAction } from "@/modules/identity/actions";

export function RevokeSessionButton({
  sessionId,
  deviceLabel,
}: {
  sessionId: string;
  deviceLabel: string;
}) {
  const t = useTranslations("settings.security");
  const te = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      aria-label={`${t("revoke")}: ${deviceLabel}`}
      onClick={() =>
        startTransition(async () => {
          const result = await revokeSessionAction(sessionId);
          if (result?.ok) {
            toast(t("revoked"), "success");
            router.refresh();
          } else {
            toast(
              te(result && !result.ok && te.has(result.error.code) ? result.error.code : "generic"),
              "error",
            );
          }
        })
      }
    >
      {t("revoke")}
    </Button>
  );
}
