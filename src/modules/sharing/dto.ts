/** How long a new link lasts. `null` = until it is revoked. */
export const SHARE_EXPIRIES = [null, 7, 30, 90] as const;
export type ShareExpiry = (typeof SHARE_EXPIRIES)[number];

/** A session's share state as its editor sees it. The link is only ever shown to someone who may manage it. */
export type ShareStatusDto =
  | { active: false }
  | {
      active: true;
      /** The full public address. */
      url: string;
      createdAt: Date;
      expiresAt: Date | null;
      createdByMe: boolean;
    };
