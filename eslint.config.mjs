import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Enforced dependency rules (ARCHITECTURE.md §22). These fail lint/CI, so the modular-monolith
 * boundaries are guarded by tooling, not by convention.
 */
const restrict = (patterns, message) => ({
  "no-restricted-imports": ["error", { patterns: [{ group: patterns, message }] }],
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // modules/* may import another module ONLY via its index. Same-module imports are relative (./x),
  // so any "@/modules/<name>/<file>" inside modules/ is a forbidden cross-module deep import.
  {
    files: ["src/modules/**/*.{ts,tsx}"],
    rules: restrict(
      ["@/modules/*/*", "@/components/**"],
      "Import other modules through their index.ts only (e.g. '@/modules/audit'); modules never import UI.",
    ),
  },

  // Infrastructure stays below the domain: lib/* must not reach up into modules or UI.
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: restrict(
      ["@/modules/**", "@/components/**"],
      "lib/* is infrastructure and must not import modules or UI.",
    ),
  },

  // Design system: no domain knowledge, no server/database access.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: restrict(
      [
        "@/modules/**",
        "@/db/**",
        "@/lib/db/**",
        "@/components/features/**",
        "@/components/layout/**",
      ],
      "components/ui is the design system: no domain, database or feature imports.",
    ),
  },

  // Engines are PURE: no framework, database, modules, UI or sport knowledge (ARCHITECTURE.md §22).
  {
    files: ["src/engines/**/*.{ts,tsx}"],
    rules: restrict(
      [
        "next",
        "next/*",
        "server-only",
        "@/modules/**",
        "@/app/**",
        "@/lib/**",
        "@/db/**",
        "@/sports/**",
        "@/components/**",
      ],
      "engines/* are pure TypeScript: they must not import Next, the database, modules, UI, or any sport.",
    ),
  },

  // Sport modules may use the engines' interfaces — never the application above them.
  {
    files: ["src/sports/**/*.{ts,tsx}"],
    rules: restrict(
      [
        "next",
        "next/*",
        "server-only",
        "@/modules/**",
        "@/app/**",
        "@/lib/db/**",
        "@/db/**",
        "@/components/**",
      ],
      "sports/* may import engines only; never modules, the app, UI or the database.",
    ),
  },

  // Pure authorization policy: no framework, no I/O.
  {
    files: ["src/lib/authz/**/*.ts"],
    rules: restrict(
      ["next", "next/*", "@/lib/db/**", "@/db/**", "@/modules/**"],
      "authz is pure: no framework or database imports.",
    ),
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".data/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
