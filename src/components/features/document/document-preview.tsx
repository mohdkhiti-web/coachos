"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  MoveHorizontal,
  ChevronDown,
  FileDown,
  ImageDown,
  Share2,
  Printer,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useFlash } from "@/components/motion";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import type { DocumentModel } from "@/modules/documents";
import { DocumentPages, type LogoSrc } from "./document-pages";

/**
 * The on-screen preview: the very pages that print, in a scrolling stage with page navigation and zoom.
 * Zoom is a CSS scale of the stage only — the pages themselves never know about it (print resets it), so
 * changing zoom or page never rebuilds the document.
 */

const MM_TO_PX = 96 / 25.4;
const STAGE_PADDING_PX = 32;
/** One tall image is offered up to this many pages (the browser cannot make a taller picture). */
const STACK_MAX_PAGES = 8;
const ZOOM_STEPS = [0.25, 0.35, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2] as const;

type ZoomMode = { kind: "fit-width" } | { kind: "fit-page" } | { kind: "custom"; value: number };

export function DocumentPreview({
  model,
  logoSrc,
  onPrint,
  pdf,
  png,
  share,
  className,
}: {
  model: DocumentModel;
  logoSrc?: LogoSrc;
  onPrint: () => void;
  /** Present only when this server can make PDFs: a real download of the saved design (never a stand-in). */
  pdf?: { busy: boolean; disabled: boolean; onDownload: () => void };
  /** PNG images of the pages (this page, all as a ZIP, all as one image), at two resolutions. Same availability as the PDF. */
  png?: {
    busy: boolean;
    disabled: boolean;
    onDownload: (
      what: "page" | "zip" | "stack",
      resolution: "standard" | "high",
      page: number,
    ) => void;
  };
  /** Present for someone who may share the session: opens the share dialog. */
  share?: { onOpen: () => void };
  className?: string;
}) {
  const t = useTranslations("sessions.design.preview");
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [zoomMode, setZoomMode] = React.useState<ZoomMode>({ kind: "fit-width" });
  const [stage, setStage] = React.useState<{ width: number; height: number } | null>(null);
  const [current, setCurrent] = React.useState(1);
  const [pageInput, setPageInput] = React.useState<string | null>(null);

  const { geometry, pageCount } = model;
  const pageWidthPx = geometry.widthMm * MM_TO_PX;
  const pageHeightPx = geometry.heightMm * MM_TO_PX;

  // measure the stage (it changes with the window and with the design panel opening)
  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitWidth = stage ? (stage.width - 2 * STAGE_PADDING_PX) / pageWidthPx : 1;
  const fitPage = stage
    ? Math.min(fitWidth, (stage.height - 2 * STAGE_PADDING_PX) / pageHeightPx)
    : 1;
  const raw =
    zoomMode.kind === "fit-width"
      ? fitWidth
      : zoomMode.kind === "fit-page"
        ? fitPage
        : zoomMode.value;
  const zoom = Math.min(2, Math.max(0.2, Math.round(raw * 100) / 100));

  const step = (direction: 1 | -1) => {
    const next =
      direction === 1
        ? ZOOM_STEPS.find((s) => s > zoom + 0.005)
        : [...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.005);
    if (next) setZoomMode({ kind: "custom", value: next });
  };

  // which page is in view: the one whose middle is nearest the middle of the stage
  const updateCurrent = React.useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const middle = el.getBoundingClientRect().top + el.clientHeight / 2;
    let best = 1;
    let bestDistance = Infinity;
    for (const page of el.querySelectorAll<HTMLElement>(".doc-page")) {
      const r = page.getBoundingClientRect();
      const distance = Math.abs(r.top + r.height / 2 - middle);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = Number(page.dataset.page);
      }
    }
    setCurrent(best);
  }, []);

  const goTo = (page: number) => {
    const target = Math.min(pageCount, Math.max(1, page));
    const el = stageRef.current?.querySelector<HTMLElement>(`.doc-page[data-page="${target}"]`);
    if (el && stageRef.current) {
      const stageTop = stageRef.current.getBoundingClientRect().top;
      const top = el.getBoundingClientRect().top;
      stageRef.current.scrollTo({
        top: stageRef.current.scrollTop + (top - stageTop) - STAGE_PADDING_PX / 2,
        behavior: "instant",
      });
    }
    setCurrent(target);
  };

  // pages appear, disappear and change size with the design: keep "current" valid and up to date
  const shownPage = Math.min(current, Math.max(1, pageCount));
  React.useEffect(() => {
    updateCurrent();
  }, [zoom, pageCount, updateCurrent]);

  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const zoomFlash = useFlash(zoomLabel);

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div
        role="toolbar"
        aria-label={t("toolbar")}
        className="doc-screen-only flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface-raised px-3 py-2"
      >
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("previousPage")}
            disabled={shownPage <= 1}
            onClick={() => goTo(shownPage - 1)}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-ink-muted">
            <span className="sr-only">{t("pageNumber")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, pageCount)}
              value={pageInput ?? String(shownPage)}
              disabled={pageCount === 0}
              onChange={(e) => {
                setPageInput(e.target.value);
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= pageCount) goTo(n);
              }}
              onBlur={() => setPageInput(null)}
              className="focus-visible:outline-focus h-10 w-14 rounded-md border border-line-strong bg-surface px-2 text-center numeral text-base text-ink focus-visible:outline-2"
            />
            <span aria-hidden>{t("of", { total: pageCount })}</span>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("nextPage")}
            disabled={shownPage >= pageCount}
            onClick={() => goTo(shownPage + 1)}
          >
            <ChevronRight className="size-5" aria-hidden />
          </Button>
        </div>
        <p role="status" className="sr-only">
          {t("currentPage", { page: shownPage, total: pageCount })}
        </p>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("zoomOut")}
            disabled={zoom <= ZOOM_STEPS[0]!}
            onClick={() => step(-1)}
          >
            <ZoomOut className="size-5" aria-hidden />
          </Button>
          <span
            key={zoomFlash.flashKey}
            className={cn(
              "w-14 text-center numeral text-sm text-ink",
              zoomFlash.changed && "animate-fade-in",
            )}
            aria-label={t("zoomLevel")}
            data-testid="zoom-level"
          >
            {zoomLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("zoomIn")}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!}
            onClick={() => step(1)}
          >
            <ZoomIn className="size-5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={zoomMode.kind === "fit-page"}
            onClick={() => setZoomMode({ kind: "fit-page" })}
          >
            <Maximize2 className="size-4" aria-hidden />
            {t("fitPage")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={zoomMode.kind === "fit-width"}
            onClick={() => setZoomMode({ kind: "fit-width" })}
          >
            <MoveHorizontal className="size-4" aria-hidden />
            {t("fitWidth")}
          </Button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {share ? (
            <Button type="button" variant="secondary" onClick={share.onOpen}>
              <Share2 className="size-4" aria-hidden />
              {t("share")}
            </Button>
          ) : null}
          {pdf ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pageCount === 0 || pdf.disabled}
              loading={pdf.busy}
              onClick={pdf.onDownload}
            >
              {pdf.busy ? null : <FileDown className="size-4" aria-hidden />}
              {pdf.busy ? t("downloadingPdf") : t("downloadPdf")}
            </Button>
          ) : null}
          {png ? (
            <Menu>
              <MenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pageCount === 0 || png.disabled}
                  loading={png.busy}
                >
                  {png.busy ? null : <ImageDown className="size-4" aria-hidden />}
                  {png.busy ? t("downloadingPng") : t("downloadPng")}
                  {png.busy ? null : <ChevronDown className="size-4" aria-hidden />}
                </Button>
              </MenuTrigger>
              <MenuContent>
                {(["standard", "high"] as const).map((resolution, i) => (
                  <React.Fragment key={resolution}>
                    {i > 0 ? <MenuSeparator /> : null}
                    <MenuLabel>{t(`png.${resolution}`)}</MenuLabel>
                    <MenuItem onSelect={() => png.onDownload("page", resolution, current)}>
                      {t("png.page", { page: current })}
                    </MenuItem>
                    {pageCount > 1 ? (
                      <MenuItem onSelect={() => png.onDownload("zip", resolution, current)}>
                        {t("png.zip", { count: pageCount })}
                      </MenuItem>
                    ) : null}
                    {pageCount > 1 && pageCount <= STACK_MAX_PAGES ? (
                      <MenuItem onSelect={() => png.onDownload("stack", resolution, current)}>
                        {t("png.stack")}
                      </MenuItem>
                    ) : null}
                  </React.Fragment>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
          <Button type="button" variant="secondary" disabled={pageCount === 0} onClick={onPrint}>
            <Printer className="size-4" aria-hidden />
            {t("print")}
          </Button>
        </div>
      </div>

      <div
        ref={stageRef}
        role="region"
        aria-label={t("stage")}
        tabIndex={0}
        onScroll={updateCurrent}
        data-zoom={zoom}
        className="doc-stage focus-visible:outline-focus h-[70dvh] min-h-96 overflow-auto rounded-lg border border-line bg-surface-sunken focus-visible:outline-2 lg:h-[calc(100dvh-13rem)]"
      >
        {pageCount === 0 ? (
          <p className="doc-screen-only animate-fade-in p-8 text-center text-ink-muted">
            {t("empty")}
          </p>
        ) : (
          <div
            className="doc-zoom mx-auto w-fit"
            style={{ zoom, padding: `${STAGE_PADDING_PX / zoom}px` }}
          >
            <DocumentPages model={model} logoSrc={logoSrc} />
          </div>
        )}
      </div>
    </div>
  );
}
