"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { DiagramEditor } from "@/components/features/diagram-editor/diagram-editor";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Diagram } from "@/engines/diagram";
import { getSportModule } from "@/sports/registry";
import type { BuilderActivity } from "./builder-model";

/**
 * Draw or change an activity's diagram inside the session builder. The activity's diagram is part of THIS session's copy: the
 * library drill it came from is never touched, and a drill activity is marked "customized" when its drawing changes.
 */
export function ActivityDiagramDialog({
  sportKey,
  activity,
  onClose,
  onSave,
  saving,
}: {
  sportKey: string;
  activity: BuilderActivity;
  onClose: () => void;
  onSave: (diagrams: Array<{ title: string; diagram: Diagram }>) => void;
  saving: boolean;
}) {
  const t = useTranslations("diagramEditor.dialog");
  const tc = useTranslations("common");
  const first = activity.diagrams[0];
  const blank = React.useMemo(() => {
    const court = getSportModule(sportKey)?.defaultCourt ?? {
      type: "half" as const,
      variant: "fiba",
    };
    return {
      schemaVersion: 1 as const,
      sport: sportKey,
      court,
      entities: [],
      actions: [],
      annotations: [],
    };
  }, [sportKey]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t("title", { title: activity.title })}
        description={first ? t("bodyEdit") : t("bodyNew")}
        closeLabel={tc("close")}
        className="max-w-5xl"
      >
        <DiagramEditor
          diagram={first?.diagram ?? blank}
          saving={saving}
          onCancel={onClose}
          onSave={(diagram) =>
            onSave([{ title: first?.title ?? "", diagram }, ...activity.diagrams.slice(1)])
          }
        />
      </DialogContent>
    </Dialog>
  );
}
