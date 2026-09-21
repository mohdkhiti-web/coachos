"use client";

import * as React from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { Result } from "@/lib/result";
import { deleteLogoAction, uploadLogoAction } from "@/modules/media/actions";
import { logoUrl, type LogoDto } from "@/modules/media/dto";
import { MAX_LOGO_BYTES } from "@/modules/media/image";

/**
 * The logo controls of the design screen: what the design uses now, uploading a new one, choosing one of the
 * workspace's logos, removing it from the design, and deleting a logo from the workspace. The browser checks the size
 * and type up front for a quick answer; the server checks everything again (and is the one that decides).
 */
export function LogoPicker({
  value,
  onChange,
  logos: initial,
  canUpload,
}: {
  value: { assetId: string } | null;
  onChange: (logo: { assetId: string } | null) => void;
  logos: LogoDto[];
  canUpload: boolean;
}) {
  const t = useTranslations("sessions.design.logo");
  const tv = useTranslations("validation");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const input = React.useRef<HTMLInputElement>(null);
  const [logos, setLogos] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<LogoDto | null>(null);
  const current = value ? logos.find((l) => l.id === value.assetId) : undefined;

  const message = (result: Extract<Result<unknown>, { ok: false }>) => {
    const key = result.error.fields?.file?.[0];
    if (key && tv.has(key)) return tv(key);
    return te.has(result.error.code) ? te(result.error.code) : te("generic");
  };

  const upload = async (file: File) => {
    setError(null);
    if (file.size > MAX_LOGO_BYTES) return setError(tv("logo_too_large"));
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type) && !/\.(png|jpe?g|svg)$/i.test(file.name))
      return setError(tv("logo_type"));
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await uploadLogoAction(form);
      if (!result.ok) return setError(message(result));
      setLogos((all) => [result.data, ...all.filter((l) => l.id !== result.data.id)]);
      onChange({ assetId: result.data.id });
      toast(t("uploaded"), "success");
    } catch {
      setError(te("network"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (logo: LogoDto) => {
    setDeleting(null);
    setBusy(true);
    try {
      const result = await deleteLogoAction(logo.id);
      if (!result.ok) {
        toast(te.has(result.error.code) ? te(result.error.code) : te("generic"), "error");
        return;
      }
      setLogos((all) => all.filter((l) => l.id !== logo.id));
      if (value?.assetId === logo.id) onChange(null);
      toast(t("deleted"), "success");
    } catch {
      toast(te("network"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="logo-picker">
      <p className="text-sm font-medium text-ink">{t("heading")}</p>

      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-line bg-surface p-2">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element -- a stored, validated logo served by our own route
            <img
              src={logoUrl(current.id)}
              alt={t("current", { name: current.name })}
              className="h-12 w-16 shrink-0 rounded-xs bg-white object-contain p-1"
            />
          ) : (
            <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xs bg-surface-sunken text-ink-muted">
              <ImagePlus className="size-5" aria-hidden />
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-sm text-ink">
            {current?.name ?? t("unavailable")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            disabled={busy}
          >
            {t("remove")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t("none")}</p>
      )}

      {canUpload ? (
        <div>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg"
            className="sr-only"
            tabIndex={-1}
            aria-label={t("file")}
            data-testid="logo-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => input.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {value ? t("replace") : t("upload")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-ink-muted">{t("hint")}</p>

      {logos.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            {t("library")}
          </legend>
          <ul className="grid grid-cols-2 gap-2">
            {logos.map((logo) => {
              const active = value?.assetId === logo.id;
              return (
                <li key={logo.id} className="relative">
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={t("use", { name: logo.name })}
                    onClick={() => onChange({ assetId: logo.id })}
                    className={cn(
                      "focus-visible:outline-focus flex h-20 w-full items-center justify-center rounded-md border bg-white p-2 focus-visible:outline-2",
                      active
                        ? "border-accent ring-2 ring-accent"
                        : "border-line-strong hover:border-accent",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a stored, validated logo served by our own route */}
                    <img
                      src={logoUrl(logo.id)}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  </button>
                  {logo.canDelete ? (
                    <button
                      type="button"
                      aria-label={t("deleteTitle", { name: logo.name })}
                      onClick={() => setDeleting(logo)}
                      className="focus-visible:outline-focus absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-surface-raised/90 text-ink-muted shadow-xs hover:text-danger focus-visible:outline-2"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent
          title={t("deleteHeading")}
          description={t("deleteBody", { name: deleting?.name ?? "" })}
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
              onClick={() => deleting && void remove(deleting)}
            >
              {t("deleteConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
