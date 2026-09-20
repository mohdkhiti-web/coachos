import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

const MAIL_DIR = path.resolve(process.cwd(), ".data/mail-e2e");

export type TestUser = { name: string; email: string; password: string };

export function newUser(label = "Coach"): TestUser {
  const id = randomUUID().slice(0, 8);
  return {
    name: `${label} ${id}`,
    email: `e2e-${id}@example.test`,
    password: "Correct-Horse-Battery-9",
  };
}

type Mail = { to: string; subject: string; text: string; sentAt: string };

/** Poll the file mail transport for the newest message to `to` (optionally matching a subject). */
export async function waitForMail(to: string, subject?: RegExp): Promise<Mail> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const files = (await readdir(MAIL_DIR)).sort().reverse();
      for (const f of files) {
        const mail = JSON.parse(await readFile(path.join(MAIL_DIR, f), "utf8")) as Mail;
        if (mail.to === to && (!subject || subject.test(mail.subject))) return mail;
      }
    } catch {
      /* directory not created yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No mail for ${to}${subject ? ` matching ${subject}` : ""}`);
}

/** The first http(s) link in a mail body. */
export function linkIn(mail: Mail): string {
  const m = mail.text.match(/https?:\/\/[^\s]+/);
  if (!m) throw new Error(`No link in mail "${mail.subject}"`);
  return m[0];
}

/**
 * A toast's text is rendered twice (visible + Radix's screen-reader announcement), so match the first.
 */
export const toast = (page: Page, text: string) => page.getByText(text, { exact: true }).first();

/** The visible inline error banner (Next also renders an empty role=alert route announcer, so don't select by role alone). */
export const formError = (page: Page, text: string) => page.getByText(text, { exact: true });

export async function signUp(page: Page, user: TestUser) {
  await page.goto("/sign-up");
  await page.getByLabel("Full name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
}

/** Sign up → open the emailed link → land on onboarding, signed in. */
export async function signUpAndVerify(page: Page, user: TestUser) {
  await signUp(page, user);
  const mail = await waitForMail(user.email, /Verify your CoachOS email/);
  await page.goto(linkIn(mail));
  await expect(page).toHaveURL(/\/onboarding/);
}

export async function completeOnboarding(
  page: Page,
  opts: { profession?: "Coach" | "PE teacher" | "Both"; timezone?: string } = {},
) {
  await page.getByText(opts.profession ?? "Coach", { exact: true }).click();
  await page.getByLabel("Your timezone").selectOption(opts.timezone ?? "Europe/Paris");
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function signIn(page: Page, user: Pick<TestUser, "email" | "password">) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}
