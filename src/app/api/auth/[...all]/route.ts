import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/modules/identity";

// Better Auth's HTTP surface (/api/auth/*): sign-in/up, verification links, password reset, etc.
// Rate limiting (database-backed) and origin/CSRF checks are enforced here.
export const { GET, POST } = toNextJsHandler(auth);
