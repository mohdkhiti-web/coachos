import "server-only";
import { env } from "@/lib/env";

/** The key share links are signed with: its own setting if given, else derived from the auth secret (separate purpose string). */
export const shareSecret = (): string => env.SHARE_SECRET ?? env.BETTER_AUTH_SECRET;
export const shareUrl = (token: string): string => `${new URL(env.APP_URL).origin}/s/${token}`;
