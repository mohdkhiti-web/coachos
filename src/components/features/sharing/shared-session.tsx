"use client";

import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DocumentPreview } from "@/components/features/document/document-preview";
import { fetchFile, saveBlob } from "@/components/features/document/download-file";
import { useToast } from "@/components/ui/toast";
import {
  buildDocumentModel,
  type DocumentDesign,
  type Reflection,
  type SessionDocumentInput,
} from "@/modules/documents";

/**
 * A session shared read-only (Step 7): the document, presented on its own. The model is the same pure
 * `buildDocumentModel` the preview and the print use, drawn by the same pages; the only differences are what is left
 * out (the coach's private notes and the reflection never reach this page) and that nothing here can be edited.
 */
export function SharedSessionView({
  token,
  title,
  input,
  design,
  reflection,
  expiresAt,
  pdfAvailable,
}: {
  token: string;
  title: string;
  input: SessionDocumentInput;
  design: DocumentDesign;
  reflection: Reflection;
  expiresAt: Date | null;
  pdfAvailable: boolean;
}) {
  const t = useTranslations("share.public");
  const te = useTranslations("errors");
  const locale = useLocale();
  const { toast } = useToast();
  const model = React.useMemo(
    () => buildDocumentModel(input, design, reflection),
    [input, design, reflection],
  );
  const [busy, setBusy] = React.useState(false);

  const downloadPdf = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await fetchFile(`/s/${token}/pdf`, "session.pdf");
      if (!file.ok) {
        toast(te.has(file.code) ? te(file.code) : te("generic"), "error");
        return;
      }
      saveBlob(file.blob, file.fileName);
      toast(t("pdfReady"), "success");
    } catch {
      toast(te("network"), "error");
    } finally {
      setBusy(false);
    }
  };

  const expires = expiresAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(expiresAt)
    : null;

  return (
    <main
      id="main"
      className="doc-print-root mx-auto w-full max-w-[110rem] space-y-5 px-4 py-6 sm:px-6 print:m-0 print:max-w-none print:space-y-0 print:p-0"
    >
      <header className="doc-screen-only space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="focus-visible:outline-focus rounded-xs display text-xl text-ink focus-visible:outline-2"
          >
            COACH<span className="text-accent">OS</span>
          </Link>
          <p className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-raised px-3 py-1 text-xs font-semibold text-ink-muted">
            <Lock className="size-3.5" aria-hidden />
            {t("readOnly")}
          </p>
        </div>
        <h1 className="display text-3xl break-words text-ink md:text-4xl">{title}</h1>
        <p className="max-w-3xl text-sm text-ink-muted">
          {t("intro")}
          {expires ? ` ${t("expires", { date: expires })}` : ""}
        </p>
      </header>

      <DocumentPreview
        model={model}
        onPrint={() => window.print()}
        logoSrc={(assetId) => `/s/${token}/logo/${assetId}`}
        pdf={
          pdfAvailable ? { busy, disabled: busy, onDownload: () => void downloadPdf() } : undefined
        }
      />

      <p className="doc-screen-only text-xs text-ink-muted">{t("footer")}</p>
    </main>
  );
}
