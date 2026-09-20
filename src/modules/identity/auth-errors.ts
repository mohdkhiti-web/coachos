/**
 * Maps Better Auth client errors to i18n keys under `errors.*`. Client-safe and pure.
 * Unknown codes fall back to a generic message — we never surface library strings to users.
 */
export type AuthClientError =
  { code?: string; status?: number; message?: string } | null | undefined;

export type AuthErrorKey =
  | "rateLimited"
  | "invalidCredentials"
  | "invalidPassword"
  | "passwordCompromised"
  | "invalidToken"
  | "sessionNotFresh"
  | "generic";

export function authErrorKey(error: AuthClientError): AuthErrorKey {
  if (!error) return "generic";
  if (error.status === 429) return "rateLimited";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "invalidCredentials";
    case "INVALID_PASSWORD":
      return "invalidPassword";
    case "PASSWORD_COMPROMISED":
      return "passwordCompromised";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "invalidToken";
    case "SESSION_NOT_FRESH":
      return "sessionNotFresh";
    default:
      return "generic";
  }
}

export const isEmailNotVerified = (error: AuthClientError) => error?.code === "EMAIL_NOT_VERIFIED";
