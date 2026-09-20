"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Copy, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { Result } from "@/lib/result";
import {
  deletePlanAction,
  duplicatePlanAction,
  restorePlanAction,
  setPlanStatusAction,
} from "@/modules/plans/actions";

/**
 * The actions on a session in "My Sessions": Open, Duplicate, Archive, Restore, Delete. Each is shown only when the
 * server says the viewer may do it, and each is checked again on the server when clicked. Delete asks first.
 */
export function SessionCardActions({
  sportKey,
  id,
  title,
  version,
  state,
  canManage,
  canDuplicate,
}: {
  sportKey: string;
  id: string;
  title: string;
  version: number;
  /** live = draft or published · archived · deleted (in the trash). */
  state: "live" | "archived" | "deleted";
  canManage: boolean;
  canDuplicate: boolean;
}) {
  const t = useTranslations("sessions.actions");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const base = `/sessions/${sportKey}`;
  const errorText = (code: string) => (te.has(code) ? te(code) : te("generic"));

  function act(call: () => Promise<Result<{ id?: string }>>, done: string, open = false) {
    startTransition(async () => {
      const r = await call();
      if (r?.ok) {
        toast(done, "success");
        if (open && r.data.id) router.push(`${base}/${r.data.id}`);
        else router.refresh();
      } else toast(errorText(r && !r.ok ? r.error.code : "INTERNAL"), "error");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      {state !== "deleted" ? (
        <Button asChild variant="primary">
          <Link href={`${base}/${id}`} aria-label={t("openTitle", { title })}>
            <ExternalLink className="size-4" aria-hidden />
            {t("open")}
          </Link>
        </Button>
      ) : null}

      {canDuplicate ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          aria-label={t("duplicateTitle", { title })}
          onClick={() => act(() => duplicatePlanAction(sportKey, id), t("duplicated"), true)}
        >
          <Copy className="size-4" aria-hidden />
          {t("duplicate")}
        </Button>
      ) : null}

      {canManage && state === "live" ? (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          aria-label={t("archiveTitle", { title })}
          onClick={() =>
            act(() => setPlanStatusAction(sportKey, id, "archived", version), t("archived"))
          }
        >
          <Archive className="size-4" aria-hidden />
          {t("archive")}
        </Button>
      ) : null}

      {canManage && state === "archived" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          aria-label={t("restoreArchiveTitle", { title })}
          onClick={() =>
            act(() => setPlanStatusAction(sportKey, id, "draft", version), t("restoredArchive"))
          }
        >
          <RotateCcw className="size-4" aria-hidden />
          {t("restoreArchive")}
        </Button>
      ) : null}

      {canManage && state === "deleted" ? (
        <Button
          type="button"
          variant="primary"
          disabled={pending}
          aria-label={t("restoreDeletedTitle", { title })}
          onClick={() => act(() => restorePlanAction(sportKey, id), t("restored"))}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t("restoreDeleted")}
        </Button>
      ) : null}

      {canManage && state !== "deleted" ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            aria-label={t("deleteTitleLabel", { title })}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4 text-danger" aria-hidden />
            {t("delete")}
          </Button>
          <DialogContent
            title={t("deleteTitle")}
            description={t("deleteBody", { title })}
            closeLabel={tc("close")}
          >
            <div className="flex flex-wrap justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {tc("cancel")}
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="danger"
                loading={pending}
                onClick={() => {
                  setConfirmOpen(false);
                  act(() => deletePlanAction(sportKey, id), t("deleted"));
                }}
              >
                {t("deleteConfirm")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
