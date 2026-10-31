import type { RosterStatus } from "@/db/enums";

export type TeamDto = {
  id: string;
  sportKey: string;
  sportName: string;
  name: string;
  notes: string;
  status: RosterStatus;
  version: number;
  playerCount: number;
  createdAt: Date;
  updatedAt: Date;
  permissions: { canEdit: boolean; canDelete: boolean };
};

export type PlayerDto = {
  id: string;
  teamId: string | null;
  teamName: string | null;
  name: string;
  dateOfBirth: string | null;
  classification: number | null;
  notes: string;
  status: RosterStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  permissions: { canEdit: boolean; canDelete: boolean };
};
