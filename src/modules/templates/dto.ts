import type { TemplateCategory, TemplateStatus, TemplateVisibility } from "@/db/enums";
import type { DesignOverride, DocumentDesign, PresetId } from "@/modules/documents";

/**
 * What crosses from the data layer to the UI: never a raw row, with the permissions already worked out for the
 * viewer and the design already resolved (preset + layer), so a card can show its colours without any logic.
 */

export interface TemplateDto {
  id: string;
  sportKey: string;
  sportName: string;
  name: string;
  description: string;
  category: TemplateCategory;
  visibility: TemplateVisibility;
  status: TemplateStatus;
  /** Concurrency token: every write bumps it. */
  version: number;
  /** The design's own revision: what a session records it was based on. */
  revision: number;
  preset: PresetId;
  /** The layer on top of the preset, as stored. */
  layer: DesignOverride;
  /** preset + layer, complete. */
  design: DocumentDesign;
  /** The creator's name; null once their account is gone. */
  authorName: string | null;
  isMine: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  forkedFromId: string | null;
  permissions: { canEdit: boolean; canDelete: boolean; canDuplicate: boolean };
}

export interface TemplatePage {
  items: TemplateDto[];
  total: number;
}

/** What a picker needs: enough to choose by and to show what it would apply. */
export interface TemplateChoice {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  visibility: TemplateVisibility;
  revision: number;
  preset: PresetId;
  design: DocumentDesign;
  isMine: boolean;
}
