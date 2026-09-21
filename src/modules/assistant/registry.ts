import "server-only";
import { env } from "@/lib/env";
import { createAnthropicProvider } from "./anthropic";
import type { AiProvider } from "./provider";
import { scriptedProvider } from "./scripted";

/**
 * Which provider is configured, if any. No provider (or no key) means the assistant is UNAVAILABLE — it says so — and every
 * other part of CoachOS keeps working: the generator, the builder, the diagram editor. Adding another provider is one adapter
 * file and one line here.
 */

let cached: AiProvider | null | undefined;

export function getProvider(): AiProvider | null {
  if (cached !== undefined) return cached;
  if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY)
    cached = createAnthropicProvider(env.ANTHROPIC_API_KEY);
  else if (env.AI_PROVIDER === "scripted") cached = scriptedProvider;
  else cached = null;
  return cached;
}

/** Tests only: swap the provider (null = none configured); `undefined` goes back to the configured one. */
export function overrideProviderForTests(provider: AiProvider | null | undefined): void {
  cached = provider;
}

/** For the interface: is there an assistant to talk to, and how many messages may one person send per day? */
export function assistantAvailability(): { available: boolean; dailyLimit: number } {
  return { available: getProvider() !== null, dailyLimit: env.AI_DAILY_MESSAGES };
}
