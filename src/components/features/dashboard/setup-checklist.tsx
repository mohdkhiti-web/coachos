import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { SectionMarker } from "@/components/ui/section-marker";
import { cn } from "@/lib/cn";
import { buildSetupChecklist } from "@/modules/identity/checklist";
import type { WidgetProps } from "./widgets";

export async function SetupChecklist({ viewer }: WidgetProps) {
  const t = await getTranslations("dashboard.checklist");
  const items = buildSetupChecklist(viewer);
  const done = items.filter((i) => i.done).length;
  const allDone = done === items.length;

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <SectionMarker n={1}>{t("eyebrow")}</SectionMarker>
            <h2 className="text-lg font-semibold tracking-tight text-ink">
              {allDone ? t("doneTitle") : t("title")}
            </h2>
            {allDone ? <p className="max-w-md text-sm text-ink-muted">{t("doneBody")}</p> : null}
          </div>
          <p className="shrink-0 text-right numeral text-3xl leading-none font-semibold text-ink">
            <span className="text-accent">{done}</span>
            <span className="text-ink-faint">/{items.length}</span>
            <span className="sr-only"> {t("progress", { done, total: items.length })}</span>
          </p>
        </div>

        <ul className="divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3.5 py-3.5">
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                  item.done
                    ? "border-success bg-success text-white dark:text-black"
                    : "border-line-strong text-ink-faint",
                )}
              >
                {item.done ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <Circle className="size-3" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    item.done ? "text-ink-muted line-through decoration-line-strong" : "text-ink",
                  )}
                >
                  {t(`items.${item.id}.title`)}
                  <span className="sr-only">{item.done ? " ✓" : ""}</span>
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{t(`items.${item.id}.description`)}</p>
              </div>
              {!item.done && item.href ? (
                <Link
                  href={item.href}
                  className="shrink-0 self-center text-sm font-medium text-accent underline-offset-4 hover:underline"
                >
                  {t(`items.${item.id}.action` as "items.preferences.action")}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
