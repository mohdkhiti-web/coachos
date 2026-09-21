/**
 * Server-side public surface of the assistant module (the AI Coaching Assistant, Step 8). Client components must NOT import
 * this file: use `./proposals` (pure) and `./dto` types directly, and call the Server Actions in `./actions`.
 */
export { applyProposal } from "./apply";
export { applyProposalInMessage, dismissProposalInMessage } from "./apply-message";
export type { ApplyResult } from "./apply";
export { PROMPT_VERSION, runTurn } from "./engine";
export type { TurnEvent, TurnInput, TurnResult } from "./engine";
export { assistantAvailability, getProvider, overrideProviderForTests } from "./registry";
export {
  deleteConversation,
  getConversation,
  getMessage,
  listConversations,
  listMessages,
  updateMessageContent,
} from "./store";
export type { ConversationDto, StoredMessage } from "./store";
export { TOOLS, runTool, sessionView, toolSpecs } from "./tools";
export type { ToolContext } from "./tools";
export * from "./proposals";
export * from "./provider";
