"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser SDK for the flows that must pass through Better Auth's HTTP endpoints so that its
 * database-backed rate limiter applies (sign-up/in, password reset/change, email change, delete).
 * It talks to /api/auth/* on the current origin; cookies are HttpOnly and never touched by JS.
 */
export const authClient = createAuthClient();
