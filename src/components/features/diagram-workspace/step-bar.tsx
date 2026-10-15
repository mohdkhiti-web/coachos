"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Input } from "@/components/ui/field";
import { LIMITS } from "@/engines/diagram";

/**
 * Step 1 | Step 2 | Step 3 | +  — a drill is a sequence of steps, each starting where the last one left everybody. The tabs
 * pick the step being shown and edited; the menu beside the current one renames, duplicates, reorders and deletes it.
 */
export function StepBar({
  count,
  current,
  titles,
  disabled,
  onSelect,
  onAdd,
  onDuplicate,
  onRename,
  onDelete,
  onMove,
}: {
  count: number;
  current: number;
  titles: Readonly<Record<string, string>> | undefined;
  disabled?: boolean;
  onSelect: (step: number) => void;
  onAdd: () => void;
  onDuplicate: (step: number) => void;
  onRename: (step: number, title: string | null) => void;
  onDelete: (step: number) => void;
  onMove: (step: number, to: number) => void;
}) {
  const t = useTranslations("diagramWorkspace");
  const [renaming, setRenaming] = React.useState(false);
  const atMax = count >= LIMITS.steps;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={t("steps.label")}
      data-testid="step-bar"
    >
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
        const title = titles?.[String(n)];
        const on = n === current;
        return (
          <button
            key={n}
            type="button"
            aria-pressed={on}
            aria-current={on ? "step" : undefined}
            data-step={n}
            disabled={disabled}
            title={title ?? t("steps.step", { n })}
            onClick={() => onSelect(n)}
            className={cn(
              "h-10 max-w-40 min-w-16 truncate rounded-md border px-3 text-sm font-medium smooth-colors",
              on
                ? "border-accent bg-accent text-accent-ink"
                : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
            )}
          >
            {title ?? t("steps.step", { n })}
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled || atMax}
        onClick={onAdd}
        aria-label={t("steps.add")}
        title={atMax ? t("steps.max", { max: LIMITS.steps }) : t("steps.add")}
        data-testid="add-step"
        className="grid size-10 place-items-center rounded-md border border-dashed border-line-strong text-ink hover:bg-surface-sunken disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
      </button>

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={t("steps.menu", { n: current })}
            data-testid="step-menu"
            className="grid size-10 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <ChevronDown className="size-4" aria-hidden />
          </button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => setRenaming(true)}>{t("steps.rename")}</MenuItem>
          <MenuItem disabled={atMax} onSelect={() => onDuplicate(current)}>
            {t("steps.duplicate")}
          </MenuItem>
          <MenuItem disabled={current <= 1} onSelect={() => onMove(current, current - 1)}>
            {t("steps.moveEarlier")}
          </MenuItem>
          <MenuItem disabled={current >= count} onSelect={() => onMove(current, current + 1)}>
            {t("steps.moveLater")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled={count <= 1} onSelect={() => onDelete(current)}>
            {t("steps.delete")}
          </MenuItem>
        </MenuContent>
      </Menu>

      {renaming ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const value = (new FormData(e.currentTarget).get("title") as string).trim();
            onRename(current, value ? value : null);
            setRenaming(false);
          }}
        >
          <Input
            name="title"
            autoFocus
            defaultValue={titles?.[String(current)] ?? ""}
            maxLength={LIMITS.stepTitle}
            aria-label={t("steps.renameLabel", { n: current })}
            placeholder={t("steps.titlePlaceholder")}
            className="h-10 w-44"
            onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
            onBlur={(e) => {
              // leaving the field saves what was typed, like every other field in the panel
              if (e.relatedTarget === null || !(e.relatedTarget as HTMLElement).closest?.("form")) {
                const value = e.target.value.trim();
                onRename(current, value ? value : null);
                setRenaming(false);
              }
            }}
          />
        </form>
      ) : null}
    </div>
  );
}
