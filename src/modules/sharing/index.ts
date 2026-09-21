/**
 * Server-side public surface of the sharing module (secure read-only links, Step 7). Client components use `./actions`
 * (Server Actions) and `./dto` directly. `token.ts` is pure.
 */
export { createShare, getShareStatus, regenerateShare, revokeShare } from "./commands";
export { publicView, readShareLogo, resolveShare } from "./queries";
export type { SharedSession } from "./queries";
export { shareSecret } from "./secret";
export { makeShareToken, parseShareToken } from "./token";
export * from "./dto";
