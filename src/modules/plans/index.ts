/**
 * Server-side public surface of the plans module (training sessions). Client components must NOT import this
 * file: use `./validators`, `./schedule`, `./details`, `./snapshot` and `./dto` (types) directly — they are pure.
 */
export {
  addBreak,
  addCustomActivity,
  addDrillActivity,
  applyTemplateToPlan,
  createPlan,
  deletePlan,
  detachTemplateFromPlan,
  duplicateActivity,
  duplicatePlan,
  removeActivity,
  reorderActivities,
  replaceActivityDrill,
  restorePlan,
  savePlanDocument,
  setPlanStatus,
  updateActivity,
  updatePlan,
} from "./commands";
export { getPlan, listPlans, listPlanTeams } from "./queries";
export type { ListPlansOptions } from "./queries";
export { toDocumentInput } from "./document-input";
export { buildSampleDocumentInput } from "./sample";
export type { SampleLabels } from "./sample";
export * from "./dto";
export * from "./filters";
