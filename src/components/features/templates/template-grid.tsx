"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ClipboardPlus,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  Wand2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { Result } from "@/lib/result";
import {
  deleteTemplateAction,
  duplicateTemplateAction,
  restoreTemplateAction,
  setTemplateStatusAction,
} from "@/modules/templates/actions";
import type { TemplateChoice, TemplateDto } from "@/modules/templates/dto";
import { ApplyTemplateDialog, type ApplyTarget } from "./apply-template-dialog";
import { Swatches, Tag } from "./template-bits";

/**
 * The templates as cards, with the actions the server says the viewer may take: Preview, Edit, Use for a new session,
 * Apply to a session, Duplicate, Archive / Restore, Delete. Each is checked again on the server when clicked; Delete
 * asks first. One "apply" dialog serves every card.
 */
export function TemplateGrid({
  items,
  sessions,
  canCreate,
}: {
  items: TemplateDto[];
  /** The viewer's live sessions (for "Apply to a session"), per sport key. */
  sessions: Record<string, ApplyTarget[]>;
  canCreate: boolean;
}) {
  const [applying, setApplying] = React.useState<TemplateDto | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const tt = useTranslations("templates");

  const choice = (x: TemplateDto): TemplateChoice => ({
    id: x.id,
    name: x.name,
    description: x.description,
    category: x.category,
    visibility: x.visibility,
    revision: x.revision,
    preset: x.preset,
    design: x.design,
    isMine: x.isMine,
  });

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {items.map((x) => (
          <li key={x.id} className="animate-fade-up">
            <TemplateCard template={x} canCreate={canCreate} onApply={() => setApplying(x)} />
          </li>
        ))}
      </ul>
      <ApplyTemplateDialog
        open={applying !== null}
        onClose={() => setApplying(null)}
        sportKey={applying?.sportKey ?? ""}
        templates={applying ? [choice(applying)] : []}
        sessions={applying ? (sessions[applying.sportKey] ?? []) : []}
        lockTemplate
        onApplied={(applied) => {
          toast(tt("toast.applied", { name: applying?.name ?? "" }), "success");
          router.refresh();
          void applied;
        }}
      />
    </>
  );
}

function TemplateCard({
  template: x,
  canCreate,
  onApply,
}: {
  template: TemplateDto;
  canCreate: boolean;
  onApply: () => void;
}) {
  const t = useTranslations("templates");
  const tcat = useTranslations("templates.categories");
  const tvis = useTranslations("templates.visibility");
  const tp = useTranslations("sessions.design");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const base = `/templates/${x.sportKey}`;
  const deleted = x.deletedAt !== null;
  const archived = x.status === "archived";

  const errorText = (code: string) => (te.has(code) ? te(code) : te("generic"));
  const run = (
    call: () => Promise<Result<{ id: string; version: number }>>,
    done: string,
    after?: (r: { id: string }) => void,
  ) =>
    startTransition(async () => {
      const r = await call();
      if (r.ok) {
        toast(done, "success");
        if (after) after(r.data);
        else router.refresh();
      } else
        toast(r.error.code === "CONFLICT" ? t("toast.changed") : errorText(r.error.code), "error");
    });

  const design = x.design;
  const facts = [
    tp(`presets.${x.preset}.name`),
    `${tp(`page.papers.${design.page.paper}`)} · ${tp(`page.orientations.${design.page.orientation}`)}`,
    tp(`mode.${design.mode}`),
  ];
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(x.updatedAt);

  return (
    <Card interactive>
      <article aria-label={x.name} data-testid="template-card">
        <CardBody className="space-y-3">
          <Swatches design={design} />
          <div className="space-y-1.5">
            <h3 className="text-lg leading-snug font-semibold break-words text-ink">
              <Link
                href={`${base}/${x.id}?view=preview`}
                className="focus-visible:outline-focus rounded-xs hover:text-accent focus-visible:outline-2"
              >
                {x.name}
              </Link>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag>{tcat(x.category)}</Tag>
              <Tag tone={x.visibility === "organization" ? "accent" : "neutral"}>
                {tvis(x.visibility)}
              </Tag>
              {archived ? <Tag tone="warning">{t("status.archived")}</Tag> : null}
              {deleted ? <Tag tone="warning">{t("status.deleted")}</Tag> : null}
            </div>
            {x.description ? <p className="text-sm text-ink-muted">{x.description}</p> : null}
          </div>
          <p className="text-sm text-ink-muted">{facts.join(" · ")}</p>
          <p className="text-xs text-ink-muted">
            {x.isMine ? t("card.byYou") : t("card.by", { name: x.authorName ?? t("card.unknown") })}{" "}
            · {t("card.revision", { revision: x.revision })} ·{" "}
            {t("card.updated", { date: updated })}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {deleted ? (
              x.permissions.canDelete ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  aria-label={t("actions.restoreDeletedTitle", { name: x.name })}
                  onClick={() =>
                    run(() => restoreTemplateAction(x.sportKey, x.id), t("toast.restored"))
                  }
                >
                  <RotateCcw className="size-4" aria-hidden />
                  {t("actions.restore")}
                </Button>
              ) : null
            ) : (
              <>
                <Button asChild variant="secondary" className="px-3">
                  <Link
                    href={`${base}/${x.id}?view=preview`}
                    aria-label={t("actions.previewTitle", { name: x.name })}
                  >
                    <Eye className="size-4" aria-hidden />
                    {t("actions.preview")}
                  </Link>
                </Button>
                {x.permissions.canEdit ? (
                  <Button asChild variant="secondary" className="px-3">
                    <Link
                      href={`${base}/${x.id}`}
                      aria-label={t("actions.editTitle", { name: x.name })}
                    >
                      <Pencil className="size-4" aria-hidden />
                      {t("actions.edit")}
                    </Link>
                  </Button>
                ) : null}
                {canCreate && !archived ? (
                  <Button asChild variant="secondary" className="px-3">
                    <Link
                      href={`/sessions/${x.sportKey}/new?template=${x.id}`}
                      aria-label={t("actions.useNewTitle", { name: x.name })}
                    >
                      <ClipboardPlus className="size-4" aria-hidden />
                      {t("actions.useNew")}
                    </Link>
                  </Button>
                ) : null}
                <Menu>
                  <MenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("actions.moreTitle", { name: x.name })}
                      disabled={pending}
                    >
                      <MoreHorizontal className="size-5" aria-hidden />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    {canCreate && !archived ? (
                      <MenuItem onSelect={onApply}>
                        <Wand2 className="size-4" aria-hidden />
                        {t("actions.apply")}
                      </MenuItem>
                    ) : null}
                    {x.permissions.canDuplicate ? (
                      <MenuItem
                        onSelect={() =>
                          run(
                            () => duplicateTemplateAction(x.sportKey, x.id),
                            t("toast.duplicated"),
                            (r) => router.push(`${base}/${r.id}`),
                          )
                        }
                      >
                        <Copy className="size-4" aria-hidden />
                        {t("actions.duplicate")}
                      </MenuItem>
                    ) : null}
                    {x.permissions.canDelete || archived ? <MenuSeparator /> : null}
                    {x.permissions.canDelete ? (
                      archived ? (
                        <MenuItem
                          onSelect={() =>
                            run(
                              () => setTemplateStatusAction(x.sportKey, x.id, "active", x.version),
                              t("toast.restored"),
                            )
                          }
                        >
                          <RotateCcw className="size-4" aria-hidden />
                          {t("actions.restore")}
                        </MenuItem>
                      ) : (
                        <MenuItem
                          onSelect={() =>
                            run(
                              () =>
                                setTemplateStatusAction(x.sportKey, x.id, "archived", x.version),
                              t("toast.archived"),
                            )
                          }
                        >
                          <Archive className="size-4" aria-hidden />
                          {t("actions.archive")}
                        </MenuItem>
                      )
                    ) : null}
                    {x.permissions.canDelete ? (
                      <MenuItem onSelect={() => setConfirmDelete(true)}>
                        <Trash2 className="size-4" aria-hidden />
                        {t("actions.delete")}
                      </MenuItem>
                    ) : null}
                  </MenuContent>
                </Menu>
              </>
            )}
          </div>
        </CardBody>
      </article>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={t("actions.deleteTitle")}
          description={t("actions.deleteBody", { name: x.name })}
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
              onClick={() => {
                setConfirmDelete(false);
                run(() => deleteTemplateAction(x.sportKey, x.id), t("toast.deleted"));
              }}
            >
              {t("actions.deleteConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
