import type {
  DrillStatus,
  Level,
  SourceKind,
  Visibility,
  EquipmentRule,
  SkillRole,
} from "@/db/enums";
import type { Diagram } from "@/engines/diagram";
import type { SportKey } from "@/sports/registry";
import type { DrillContent } from "./content";

/**
 * What crosses from the data layer to the UI. Never a raw row (ARCHITECTURE.md §3.2): rows carry
 * ownership internals; DTOs carry what a screen needs plus already-computed permissions.
 */

/** library = CoachOS curated (public) · workspace = shared inside my organization · mine = my private drills. */
export type DrillScope = "library" | "workspace" | "mine";

export interface DrillCardDto {
  id: string;
  title: string;
  description: string;
  category: { key: string; name: string };
  primarySkill: { key: string; name: string } | null;
  level: Level;
  ageMin: number;
  ageMax: number;
  playersMin: number;
  playersMax: number;
  durationMin: number;
  durationMax: number;
  space: string;
  equipment: Array<{ key: string; name: string }>;
  scope: DrillScope;
  /** First diagram, for the thumbnail. Null when the drill has none. */
  diagram: Diagram | null;
  updatedAt: Date;
}

export interface DrillPage {
  items: DrillCardDto[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export interface DrillDetailDto extends Omit<DrillCardDto, "equipment" | "diagram"> {
  sportKey: SportKey;
  content: DrillContent;
  tags: string[];
  skills: Array<{ key: string; name: string; role: SkillRole }>;
  equipment: Array<{ key: string; name: string; rule: EquipmentRule; quantity: number }>;
  diagrams: Array<{ id: string; title: string; diagram: Diagram }>;
  source: { kind: SourceKind; name: string | null; url: string | null };
  visibility: Visibility;
  status: DrillStatus;
  version: number;
  forkedFromId: string | null;
  createdAt: Date;
  permissions: { canEdit: boolean; canArchive: boolean; canDuplicate: boolean };
}

export interface CategoryCount {
  key: string;
  name: string;
  description: string | null;
  count: number;
}

export interface SportOverviewDto {
  libraryCount: number;
  myCount: number;
  categories: CategoryCount[];
}
