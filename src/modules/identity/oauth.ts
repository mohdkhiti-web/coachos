import "server-only";
import { env } from "@/lib/env";

/** Which social sign-in providers this deployment has credentials for. Flags only — no secrets ever leave the server. */
export type OAuthProviders = { google: boolean; apple: boolean };

export const oauthProviders = (): OAuthProviders => ({ ...env.oauth });
