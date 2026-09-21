"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, RefreshCw, Share2, ShieldOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  createShareAction,
  getShareAction,
  regenerateShareAction,
  revokeShareAction,
} from "@/modules/sharing/actions";
import { SHARE_EXPIRIES, type ShareExpiry, type ShareStatusDto } from "@/modules/sharing/dto";

/**
 * Share a session read-only: see whether it is shared, make the link, copy it, regenerate it (the old one stops at once)
 * or stop sharing. The dialog says in words what a link shows and what it never shows, and every destructive step is
 * confirmed. The server decides who may (`plan:share`); this only asks.
 */
export function ShareDialog({
  open,
  onClose,
  sportKey,
  planId,
  unsavedChanges,
}: {
  open: boolean;
  onClose: () => void;
  sportKey: string;
  planId: string;
  /** The design on screen has changes that are not saved: the link shows the saved design. */
  unsavedChanges: boolean;
}) {
  const t = useTranslations("share.dialog");
  const tc = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t("title")}
        description={t("body")}
        closeLabel={tc("close")}
        className="max-w-xl"
      >
        <ShareBody sportKey={sportKey} planId={planId} unsavedChanges={unsavedChanges} />
      </DialogContent>
    </Dialog>
  );
}

function ShareBody({
  sportKey,
  planId,
  unsavedChanges,
}: {
  sportKey: string;
  planId: string;
  unsavedChanges: boolean;
}) {
  const t = useTranslations("share.dialog");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { toast } = useToast();
  const [status, setStatus] = React.useState<ShareStatusDto | null>(null);
  const [days, setDays] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"regenerate" | "revoke" | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // load the current state when the dialog opens (this component mounts fresh each time it does)
  React.useEffect(() => {
    let cancelled = false;
    void getShareAction(sportKey, planId).then((r) => {
      if (cancelled) return;
      if (r.ok) setStatus(r.data);
      else setError(te.has(r.error.code) ? te(r.error.code) : te("generic"));
    });
    return () => {
      cancelled = true;
    };
  }, [sportKey, planId, te]);

  const expiry = (): ShareExpiry => {
    const n = Number(days);
    return (SHARE_EXPIRIES as readonly (number | null)[]).includes(n) && n > 0
      ? (n as ShareExpiry)
      : null;
  };

  const run = async (
    call: () => Promise<Awaited<ReturnType<typeof createShareAction>>>,
    done: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const r = await call();
      if (!r.ok) {
        setError(
          r.error.code === "FORBIDDEN"
            ? t("forbidden")
            : te.has(r.error.code)
              ? te(r.error.code)
              : te("generic"),
        );
        return;
      }
      setStatus(r.data);
      setConfirm(null);
      setCopied(false);
      toast(done, "success");
    } catch {
      setError(te("network"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast(t("copied"), "success");
    } catch {
      setError(t("copyFailed"));
    }
  };

  const date = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(d);

  return (
    <div className="space-y-5" data-testid="share-dialog">
      <ul className="space-y-1 rounded-md bg-surface-sunken px-4 py-3 text-sm text-ink-muted">
        <li>{t("shows")}</li>
        <li>{t("hides")}</li>
        <li>{t("readOnly")}</li>
      </ul>
      {unsavedChanges ? (
        <p className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-ink">
          {t("unsaved")}
        </p>
      ) : null}

      {status === null && !error ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("loading")}
        </p>
      ) : null}

      {status && !status.active ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">{t("notShared")}</p>
          <label className="block text-sm font-medium text-ink">
            {t("expiry")}
            <Select
              className="mt-1"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={busy}
            >
              <option value="">{t("expiryNever")}</option>
              {SHARE_EXPIRIES.filter((d): d is 7 | 30 | 90 => d !== null).map((d) => (
                <option key={d} value={String(d)}>
                  {t("expiryDays", { count: d })}
                </option>
              ))}
            </Select>
          </label>
          <Button
            type="button"
            loading={busy}
            onClick={() =>
              void run(() => createShareAction(sportKey, planId, expiry()), t("created"))
            }
          >
            <Share2 className="size-4" aria-hidden />
            {t("create")}
          </Button>
        </div>
      ) : null}

      {status && status.active ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="share-link" className="block text-sm font-medium text-ink">
              {t("link")}
            </label>
            <div className="flex gap-2">
              <Input
                id="share-link"
                readOnly
                value={status.url}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="secondary" onClick={() => void copy(status.url)}>
                {copied ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
                {copied ? t("copiedShort") : t("copy")}
              </Button>
            </div>
            <p className="text-xs text-ink-muted">
              {status.expiresAt
                ? t("expiresOn", { date: date(status.expiresAt) })
                : t("neverExpires")}{" "}
              <a
                href={status.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-4"
              >
                {t("open")}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </p>
          </div>

          {confirm === "regenerate" ? (
            <div
              role="group"
              aria-label={t("regenerateTitle")}
              className="space-y-3 rounded-md border border-warning bg-warning-soft p-3"
            >
              <p className="text-sm text-ink">{t("regenerateBody")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  loading={busy}
                  onClick={() =>
                    void run(() => regenerateShareAction(sportKey, planId, null), t("regenerated"))
                  }
                >
                  {t("regenerateConfirm")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          ) : confirm === "revoke" ? (
            <div
              role="group"
              aria-label={t("revokeTitle")}
              className="space-y-3 rounded-md border border-danger bg-danger-soft p-3"
            >
              <p className="text-sm text-ink">{t("revokeBody")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="danger"
                  loading={busy}
                  onClick={() => void run(() => revokeShareAction(sportKey, planId), t("revoked"))}
                >
                  {t("revokeConfirm")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirm("regenerate")}>
                <RefreshCw className="size-4" aria-hidden />
                {t("regenerate")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirm("revoke")}>
                <ShieldOff className="size-4" aria-hidden />
                {t("revoke")}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {t("done")}
          </Button>
        </DialogClose>
      </div>
    </div>
  );
}
