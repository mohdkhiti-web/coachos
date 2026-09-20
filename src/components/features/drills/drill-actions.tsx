"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Copy, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { archiveDrillAction, duplicateDrillAction } from "@/modules/drills/actions";

/** Real actions only: each button is shown when the server computed the permission, and re-checked server-side on click. */
export function DrillActions({
  sportKey,
  drillId,
  title,
  isLibrary,
  permissions,
}: {
  sportKey: string;
  drillId: string;
  title: string;
  isLibrary: boolean;
  permissions: { canEdit: boolean; canArchive: boolean; canDuplicate: boolean };
}) {
  const t = useTranslations("drills.detail");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const base = `/sports/${sportKey}/drills`;

  const errorText = (code: string) => (te.has(code) ? te(code) : te("generic"));

  function duplicate() {
    startTransition(async () => {
      const r = await duplicateDrillAction(sportKey, drillId);
      if (r?.ok) {
        toast(t("duplicated"), "success");
        router.push(`${base}/${r.data.id}`);
      } else {
        toast(errorText(r && !r.ok ? r.error.code : "INTERNAL"), "error");
      }
    });
  }

  function archive() {
    startTransition(async () => {
      const r = await archiveDrillAction(sportKey, drillId);
      if (r?.ok) {
        setConfirmOpen(false);
        toast(t("archived"), "success");
        router.push(base);
        router.refresh();
      } else {
        toast(errorText(r && !r.ok ? r.error.code : "INTERNAL"), "error");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {permissions.canEdit ? (
        <Button asChild>
          <Link href={`${base}/${drillId}/edit`}>
            <Pencil className="size-4" aria-hidden />
            {t("edit")}
          </Link>
        </Button>
      ) : null}
      {permissions.canDuplicate ? (
        <Button
          variant={permissions.canEdit ? "secondary" : "primary"}
          onClick={duplicate}
          loading={pending && !confirmOpen}
        >
          <Copy className="size-4" aria-hidden />
          {isLibrary ? t("duplicateLibrary") : t("duplicate")}
        </Button>
      ) : null}
      {permissions.canArchive ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost">
              <Archive className="size-4" aria-hidden />
              {t("archive")}
            </Button>
          </DialogTrigger>
          <DialogContent
            title={t("archiveTitle")}
            description={t("archiveBody", { title })}
            closeLabel={tc("close")}
          >
            <div className="flex flex-wrap justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {tc("cancel")}
                </Button>
              </DialogClose>
              <Button type="button" variant="danger" loading={pending} onClick={archive}>
                {t("archiveConfirm")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
