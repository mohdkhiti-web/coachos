/**
 * Server-side public surface of the templates module (saved document designs). Client components must NOT import this
 * file: use `./actions` (Server Actions), `./filters`, `./validators` and `./dto` (types) directly — they are pure.
 */
export {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  restoreTemplate,
  setTemplateStatus,
  updateTemplate,
} from "./commands";
export { getTemplate, listTemplateChoices, listTemplates, readConfig, resourceOf } from "./queries";
export type { ListTemplatesOptions } from "./queries";
export * from "./dto";
export * from "./filters";
