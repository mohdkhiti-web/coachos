/**
 * The documents module: what a printed session looks like (design), what is on each page (document model) and
 * where the pages break (pagination). Everything here is pure — no I/O, no React, no server-only import — so
 * the browser (live preview, print), the server (validating a saved design) and the PDF renderer of a later step
 * all import it from here and agree by construction.
 */
export * from "./color";
export * from "./design";
export * from "./layout";
export { buildDocumentModel, buildFacts, collectEquipment, withBranding } from "./model";
export { paginate, fragmentHeight } from "./paginate";
export type { BodyPage, Segment } from "./paginate";
export * from "./presets";
export * from "./types";
