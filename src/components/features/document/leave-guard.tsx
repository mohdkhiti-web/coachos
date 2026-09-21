"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";

/**
 * "Never lose changes by accident", shared by every screen that edits a design (a session's, a template's): while
 * there are unsaved changes, closing or reloading the tab asks first (`beforeunload`), and so does any in-app link —
 * the side navigation, the account menu, a tab of the workspace that leaves the page.
 *
 * `request(href)` goes there at once when nothing is unsaved and asks otherwise; `go(href)` leaves without asking.
 */
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const allowed = React.useRef(false);
  const [leaveTo, setLeaveTo] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!allowed.current) e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (allowed.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return; // the view tabs of this very page
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const go = (href: string) => {
    allowed.current = true;
    router.push(href);
  };
  const request = (href: string) => (dirty ? setLeaveTo(href) : go(href));
  return { leaveTo, setLeaveTo, go, request };
}

/** The question: keep editing, leave without saving, or save and leave. */
export function LeaveDialog({
  href,
  canSave,
  saveDisabled,
  onClose,
  onLeave,
  onSaveAndLeave,
}: {
  href: string | null;
  canSave: boolean;
  saveDisabled: boolean;
  onClose: () => void;
  onLeave: (href: string) => void;
  /** Save, and report whether it worked. */
  onSaveAndLeave: () => Promise<boolean>;
}) {
  const t = useTranslations("sessions.design.leave");
  const tc = useTranslations("common");
  return (
    <Dialog open={href !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={t("title")} description={t("body")} closeLabel={tc("close")}>
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("stay")}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const target = href;
              onClose();
              if (target) onLeave(target);
            }}
          >
            {t("discard")}
          </Button>
          {canSave ? (
            <Button
              type="button"
              disabled={saveDisabled}
              onClick={async () => {
                const target = href;
                if (target && (await onSaveAndLeave())) {
                  onClose();
                  onLeave(target);
                }
              }}
            >
              {t("saveAndLeave")}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
