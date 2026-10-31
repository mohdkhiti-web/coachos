"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
}: {
  player: PlayerDto;
  teams: readonly { id: string; name: string }[];
}) {
  const t = useTranslations("roster");
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
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="text-sm font-medium text-ink">{player.name}</p>
        <p className="text-xs text-ink-muted">
          {[
            player.dateOfBirth,
            player.classification !== null
              ? `${t("classification")} ${player.classification.toFixed(1)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {player.permissions.canEdit ? (
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {t("edit")}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                {t("remove")}
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
