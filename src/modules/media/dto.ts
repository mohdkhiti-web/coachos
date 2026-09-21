import type { LogoMime } from "@/db/enums";

/** A logo as the UI sees it: never the bytes, never a storage path. `url` is the authenticated route that serves it. */
export interface LogoDto {
  id: string;
  name: string;
  mime: LogoMime;
  width: number;
  height: number;
  byteSize: number;
  createdAt: Date;
  isMine: boolean;
  canDelete: boolean;
  url: string;
}

/** The address a logo is served from inside the app (workspace members only). */
export const logoUrl = (id: string) => `/logos/${id}`;

export interface LogoFile {
  mime: LogoMime;
  bytes: Buffer;
  sha256: string;
}
