"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search, Star, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/field";
import { ToolGlyph } from "./tool-glyph";
import {
  searchTools,
  TOOL_BY_ID,
  TOOL_CATEGORIES,
  toolsIn,
  type ToolCategory,
  type ToolDef,
} from "./tools";

/**
 * The left panel: search, categories, recent and favourite tools, and every tool as a card. A card is a button (click to add
 * at a sensible spot, or to pick up a drawing tool) that can also be picked up with the mouse and dropped on the court.
 */
export function ToolLibrary({
  activeToolId,
  onPick,
  onDragStart,
  disabled,
  recent,
  favorites,
  onToggleFavorite,
  number,
  onNumber,
}: {
  activeToolId: string | null;
  onPick: (tool: ToolDef) => void;
  onDragStart: (tool: ToolDef, e: React.PointerEvent) => void;
  disabled?: boolean;
  recent: readonly string[];
  favorites: readonly string[];
  onToggleFavorite: (id: string) => void;
  number: string;
  onNumber: (value: string) => void;
}) {
  const t = useTranslations("diagramWorkspace");
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<ToolCategory | "all">("all");
  const name = React.useCallback((id: string) => t(`tools.${id}`), [t]);

  const searching = query.trim().length > 0;
  const shown = React.useMemo(
    () => searchTools(query, name, toolsIn(category)),
    [query, category, name],
  );
  const byCategory = React.useMemo(() => {
    const groups = new Map<ToolCategory, ToolDef[]>();
    for (const tool of shown)
      groups.set(tool.category, [...(groups.get(tool.category) ?? []), tool]);
    return TOOL_CATEGORIES.flatMap((c) => (groups.has(c) ? [[c, groups.get(c)!] as const] : []));
  }, [shown]);

  const card = (tool: ToolDef) => (
    <ToolCard
      key={tool.id}
      tool={tool}
      label={name(tool.id)}
      active={activeToolId === tool.id}
      favorite={favorites.includes(tool.id)}
      disabled={disabled}
      onPick={onPick}
      onDragStart={onDragStart}
      onToggleFavorite={onToggleFavorite}
      favoriteLabel={(fav) => t(fav ? "removeFavorite" : "addFavorite", { name: name(tool.id) })}
    />
  );
  const list = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const tool = TOOL_BY_ID.get(id);
      return tool ? [card(tool)] : [];
    });

  return (
    <div className="flex min-h-0 flex-col gap-3" data-testid="tool-library">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="pl-9"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            aria-label={t("clearSearch")}
            className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken"
            onClick={() => setQuery("")}
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div
        role="group"
        aria-label={t("categoriesLabel")}
        className="flex flex-wrap gap-1.5"
        data-testid="tool-categories"
      >
        {(["all", ...TOOL_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "h-8 rounded-full border px-3 text-xs font-medium smooth-colors",
              category === c
                ? "border-accent bg-accent text-accent-ink"
                : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
            )}
          >
            {t(`categories.${c}`)}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <span className="shrink-0">{t("numberLabel")}</span>
        <Input
          value={number}
          onChange={(e) => onNumber(e.target.value.slice(0, 3))}
          maxLength={3}
          inputMode="numeric"
          className="h-8 w-16 px-2 text-center"
          aria-describedby="number-hint"
        />
        <span id="number-hint" className="sr-only">
          {t("numberHint")}
        </span>
      </label>

      <div className="min-h-0 space-y-4 overflow-y-auto pr-1" data-testid="tool-list">
        {!searching && category === "all" && favorites.length > 0 ? (
          <Group title={t("favorites")} testId="tool-favorites">
            {list(favorites)}
          </Group>
        ) : null}
        {!searching && category === "all" && recent.length > 0 ? (
          <Group title={t("recent")} testId="tool-recent">
            {list(recent)}
          </Group>
        ) : null}
        {byCategory.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-strong p-3 text-sm text-ink-muted">
            {t("noTools", { query })}
          </p>
        ) : (
          byCategory.map(([c, tools]) => (
            <Group key={c} title={t(`categories.${c}`)}>
              {tools.map(card)}
            </Group>
          ))
        )}
      </div>
      <p className="text-xs text-ink-muted">{t("libraryHint")}</p>
    </div>
  );
}

function Group({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section aria-label={title} data-testid={testId}>
      <h4 className="mb-1.5 eyebrow">{title}</h4>
      <ul className="grid grid-cols-1 gap-1.5">{children}</ul>
    </section>
  );
}

function ToolCard({
  tool,
  label,
  active,
  favorite,
  disabled,
  onPick,
  onDragStart,
  onToggleFavorite,
  favoriteLabel,
}: {
  tool: ToolDef;
  label: string;
  active: boolean;
  favorite: boolean;
  disabled?: boolean;
  onPick: (tool: ToolDef) => void;
  onDragStart: (tool: ToolDef, e: React.PointerEvent) => void;
  onToggleFavorite: (id: string) => void;
  favoriteLabel: (favorite: boolean) => string;
}) {
  const pointerDown = React.useRef<{ x: number; y: number; id: number } | null>(null);
  const dragged = React.useRef(false);
  return (
    <li className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={tool.draw ? active : undefined}
        data-tool={tool.id}
        title={label}
        // a mouse or pen can pick a tool up; a finger just taps (dragging would fight scrolling the list)
        onPointerDown={(e) => {
          if (disabled || !tool.place || e.pointerType === "touch" || e.button !== 0) return;
          // keep receiving the moves even if the pointer leaves the card quickly
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* not supported: the drag still starts from the moves the card sees */
          }
          pointerDown.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          dragged.current = false;
        }}
        onPointerMove={(e) => {
          const down = pointerDown.current;
          if (!down || down.id !== e.pointerId || dragged.current) return;
          if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) {
            dragged.current = true;
            pointerDown.current = null;
            onDragStart(tool, e);
          }
        }}
        onPointerUp={() => {
          pointerDown.current = null;
        }}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false; // that click ended a drag
            return;
          }
          onPick(tool);
        }}
        className={cn(
          "flex h-12 w-full cursor-grab touch-manipulation items-center gap-2 rounded-md border px-2 pr-7 text-left text-xs font-medium select-none smooth-colors",
          "focus-visible:outline-2 active:cursor-grabbing disabled:opacity-50",
          active
            ? "border-accent bg-accent-soft text-ink"
            : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
        )}
      >
        <span className="grid h-9 w-12 shrink-0 place-items-center">
          <ToolGlyph tool={tool} />
        </span>
        <span className="min-w-0 flex-1 truncate leading-tight">{label}</span>
      </button>
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={favoriteLabel(favorite)}
        onClick={() => onToggleFavorite(tool.id)}
        className="absolute top-1 right-1 grid size-6 place-items-center rounded text-ink-muted hover:bg-surface-sunken hover:text-ink"
      >
        <Star className={cn("size-3.5", favorite && "fill-accent text-accent")} aria-hidden />
      </button>
    </li>
  );
}
