"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { PlayerDto } from "@/modules/roster";
import { deletePlayerAction } from "@/modules/roster/actions";
import { PlayerForm } from "./player-form";

export function PlayerRow({
  player,
  teams,
  number,
  age,
}: {
  player: PlayerDto;
  teams: readonly { id: string; name: string }[];
  /** Position on the sheet (1-based), shown as the scorer's line number. */
  number?: number;
  /** Whole years today, from the date of birth (computed by the page in the coach's timezone). */
  age?: number | null;
}) {
  const t = useTranslations("roster");
  const format = useFormatter();
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  async function remove() {
    startTransition(async () => {
      const result = await deletePlayerAction(player.id);
      if (result.ok) {
        toast(t("playerRemoved"), "success");
        router.refresh();
      } else {
        toast(t("removeFailed"), "error");
      }
    });
  }

  if (editing) {
    return (
      <Card className="mb-3">
        <PlayerForm
          teams={teams}
          defaults={{
            id: player.id,
            version: player.version,
            name: player.name,
            teamId: player.teamId,
            dateOfBirth: player.dateOfBirth,
            classification: player.classification,
            notes: player.notes,
          }}
          onSaved={() => setEditing(false)}
        />
      </Card>
    );
  }

  return (
    <li
      className="group/row flex animate-fade-up items-center gap-3 py-3 sm:gap-4"
      style={{ animationDelay: `${Math.min(number ?? 0, 12) * 35}ms` }}
    >
      {number !== undefined ? (
        <span
          aria-hidden
          className="w-7 shrink-0 text-right numeral text-lg font-semibold text-ink-faint"
        >
          {String(number).padStart(2, "0")}
        </span>
      ) : null}
      <Avatar
        name={player.name}
        className="transition-transform duration-200 group-hover/row:scale-110"
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-ink">{player.name}</span>
          {player.classification !== null ? (
            <span className="rounded-xs border border-accent/40 bg-accent-soft px-1.5 py-px numeral text-xs font-semibold text-accent-strong">
              <span className="sr-only">{t("classification")} </span>
              {player.classification.toFixed(1)}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-sm text-ink-muted">
          {[
            age !== null && age !== undefined ? t("age", { age }) : null,
            player.dateOfBirth
              ? t("born", {
                  date: format.dateTime(new Date(`${player.dateOfBirth}T12:00:00Z`), {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  }),
                })
              : null,
            player.notes || null,
          ]
            .filter(Boolean)
            .join(" · ") || t("noDetails")}
        </p>
      </div>
      {player.permissions.canEdit ? (
        <div className="flex shrink-0 gap-1 transition-opacity [@media(hover:hover)]:opacity-60 [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("editPlayer", { name: player.name })}
            title={t("edit")}
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removePlayer", { name: player.name })}
                title={t("remove")}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent title={t("removePlayerTitle")} closeLabel={t("close")}>
              <p className="text-sm text-ink-muted">
                {t("removePlayerBody", { name: player.name })}
              </p>
              <div className="mt-5 flex justify-end gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button type="button" variant="danger" loading={pending} onClick={remove}>
                    {t("remove")}
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </li>
  );
}
