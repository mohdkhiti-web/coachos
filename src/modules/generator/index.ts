/**
 * Server-side public surface of the generator module (the deterministic session generator, Step 8). Client components
 * must NOT import this file: use `./requirements`, `./types`, `./rules`, `./validate` and `./generate` (all pure).
 */
export { loadCandidates } from "./queries";
export {
  createGeneratedSession,
  generatedItemsSchema,
  previewGeneration,
  reviseGeneration,
} from "./commands";
export type { GenerationLabels, GenerationPreview } from "./dto";
export { alternativesFor, equipmentPeak, generateSession, rankDrills } from "./generate";
export { requirementsSchema, basketsOf, availableOf } from "./requirements";
export type { Requirements, RequirementsInput } from "./requirements";
export { validateSession, servesObjective } from "./validate";
export * from "./types";
