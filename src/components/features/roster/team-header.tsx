"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { TeamDto } from "@/modules/roster";
import { deleteTeamAction } from "@/modules/roster/actions";
import { TeamForm } from "./team-form";

export function TeamHeader({ team }: { team: TeamDto }) {
  const t = useTranslations("roster");
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  async function remove() {
    startTransition(async () => {
      const result = await deleteTeamAction(team.id);
      if (result.ok) {
        toast(t("teamDeleted"), "success");
        router.push("/roster");
      } else {
        toast(t("removeFailed"), "error");
      }
    });
  }

  if (editing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("form.title")}</CardTitle>
        </CardHeader>
        <TeamForm
          defaults={{ id: team.id, version: team.version, name: team.name, notes: team.notes }}
        />
        <CardBody className="pt-0">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {t("cancel")}
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="display text-4xl text-ink">{team.name}</h1>
        <p className="text-sm font-semibold text-accent">{team.sportName}</p>
        {team.notes ? <p className="max-w-2xl text-ink-muted">{team.notes}</p> : null}
        {team.status === "archived" ? (
          <span className="inline-block rounded-xs border border-line px-2 py-0.5 text-xs text-ink-muted">
            {t("archived")}
          </span>
        ) : null}
      </div>
      {team.permissions.canEdit ? (
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            {t("edit")}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost">
                {t("remove")}
              </Button>
            </DialogTrigger>
            <DialogContent title={t("removeTeamTitle")} closeLabel={t("close")}>
              <p className="text-sm text-ink-muted">{t("removeTeamBody", { name: team.name })}</p>
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
    </header>
  );
}
