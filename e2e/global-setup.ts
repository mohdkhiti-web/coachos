import { rm } from "node:fs/promises";
import path from "node:path";

// Start each run with an empty mailbox so helpers never pick up a previous run's emails.
export default async function globalSetup() {
  await rm(path.resolve(process.cwd(), ".data/mail-e2e"), { recursive: true, force: true });
}
