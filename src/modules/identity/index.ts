/**
 * Server-side public surface of the identity module (ARCHITECTURE.md §3.2).
 * Client components must NOT import this file: use `./client` (browser SDK) or `./actions`
 * (Server Actions) directly.
 */
export { auth, clientIp } from "./auth";
export { getViewer, requireViewer } from "./viewer";
export type { Viewer, ProfileDto } from "./viewer";
export { listOwnSessions } from "./queries";
export type { SessionDto } from "./queries";
export * as validators from "./validators";
export { oauthProviders } from "./oauth";
export type { OAuthProviders } from "./oauth";
export type { CoachingProfileDto } from "./coaching-profile";
export {
  coachingContext,
  EMPTY_COACHING_PROFILE,
  hasCoachingProfile,
  recommendationAge,
  recommendationQueries,
  sessionDefaults,
} from "./coaching-profile";
