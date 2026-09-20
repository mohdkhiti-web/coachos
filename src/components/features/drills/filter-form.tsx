"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The library filter form. It is a real GET form (works without JavaScript), enhanced to update the
 * URL in place as you change a filter, so results re-render on the server without a full reload and
 * every filtered view is a shareable link. Inputs are uncontrolled and re-synced from the URL whenever
 * it changes (chips, "clear", back/forward) — except the field being typed in, so typing is never disturbed.
 */
export function FilterForm({
  activeCount,
  children,
}: {
  activeCount: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("drills.filters");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const formRef = React.useRef<HTMLFormElement>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  const submit = React.useCallback(
    (form: HTMLFormElement) => {
      const params = new URLSearchParams();
      new FormData(form).forEach((v, k) => {
        if (typeof v === "string" && v.trim() !== "") params.set(k, v.trim());
      });
      // "scope=all" is the default; keep URLs short
      if (params.get("scope") === "all") params.delete("scope");
      // …and so is the default sort ("best match" when searching, otherwise "newest")
      if (params.get("sort") === (params.has("q") ? "relevance" : "recent")) params.delete("sort");
      startTransition(() => {
        router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
      });
    },
    [router, pathname],
  );

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  // Keep the inputs in step with the URL (chips, clear, back/forward), except the focused field.
  React.useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    // The URL changed from outside the form (a chip, "clear", back/forward) while nobody is typing here:
    // a pending debounced submit would resurrect the old values over it, so drop it.
    if (!form.contains(document.activeElement)) window.clearTimeout(timer.current);
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) continue;
      if (!el.name || el === document.activeElement) continue;
      const fallback = el.name === "scope" ? "all" : el.name === "sort" ? undefined : "";
      const value = searchParams.get(el.name) ?? fallback;
      if (value === undefined) continue;
      if (el instanceof HTMLInputElement && el.type === "radio") el.checked = el.value === value;
      else if (el instanceof HTMLInputElement && el.type === "checkbox")
        el.checked = el.value === value;
      else if (el.value !== value) el.value = value;
    }
  }, [searchParams]);

  function clearAll() {
    const form = formRef.current;
    if (!form) return;
    for (const el of Array.from(form.elements)) {
      if (el instanceof HTMLInputElement && el.type === "radio") el.checked = el.value === "all";
      else if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = false;
      else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        if (el.name && el.name !== "sort") el.value = "";
      }
    }
    submit(form);
  }

  return (
    <div>
      {/* On phones the filters fold away behind a button; from md up they are always visible. */}
      <div className="mb-3 md:hidden">
        <Button
          type="button"
          variant="secondary"
          className="w-full justify-between"
          aria-expanded={open}
          aria-controls="library-filters"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-4" aria-hidden />
            {t("title")}
          </span>
          {activeCount > 0 ? (
            <span className="rounded-full bg-accent px-2 py-0.5 numeral text-sm text-accent-ink">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </div>

      <form
        ref={formRef}
        id="library-filters"
        method="get"
        action={pathname}
        role="search"
        aria-label={t("title")}
        aria-busy={pending}
        className={cn("space-y-5", open ? "block" : "hidden", "md:block")}
        onSubmit={(e) => {
          e.preventDefault();
          window.clearTimeout(timer.current);
          submit(e.currentTarget);
        }}
        onChange={(e) => {
          const el = e.target as HTMLElement;
          const form = e.currentTarget;
          window.clearTimeout(timer.current);
          const typing =
            el instanceof HTMLInputElement && ["search", "number", "text"].includes(el.type);
          if (typing) timer.current = window.setTimeout(() => submit(form), 450);
          else submit(form);
        }}
      >
        {children}
        <div className="flex items-center justify-between gap-3">
          <Button type="submit" size="sm">
            {t("apply")}
          </Button>
          {activeCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              <X className="size-4" aria-hidden />
              {t("clear")}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
