import { readFile } from "node:fs/promises";
import { A4, inspectPdf, LETTER } from "./support/pdf";
import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, newUser, signUpAndVerify, toast } from "./support/helpers";
import { buildSession, choose, pages, saveButton, settled, status } from "./support/document";

async function signedIn(page: Page, label = "Exporter") {
  await signUpAndVerify(page, newUser(label));
  await completeOnboarding(page);
}

const openDesign = async (page: Page, builder: string) => {
  await page.goto(`${builder}/document?view=design`);
  await expect(page.getByRole("heading", { level: 1, name: "Design and preview" })).toBeVisible();
  await settled(page);
};

/** Click Download PDF and return what the browser was given. */
async function downloadPdf(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const path = await download.path();
  const bytes = await readFile(path);
  const report = await inspectPdf(bytes);
  return {
    name: download.suggestedFilename(),
    bytes,
    info: {
      pages: report.pageCount,
      width: report.pages[0]!.width,
      height: report.pages[0]!.height,
    },
  };
}

test("download a session as a PDF: the saved design, on the paper it chose, page for page as previewed", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signedIn(page);
  const builder = await buildSession(page, "Export run");
  await openDesign(page, builder);
  const previewPages = await pages(page).count();
  expect(previewPages).toBeGreaterThanOrEqual(3);

  // ---- the file is the print pipeline's: same pages, the design's paper ----------------------------------------
  const first = await downloadPdf(page);
  await expect(toast(page, "PDF downloaded")).toBeVisible();
  expect(first.name).toBe("Export run.pdf");
  expect(first.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(first.bytes.length).toBeGreaterThan(20_000); // real content: text, diagrams, fonts — not an empty page
  expect(first.info.pages).toBe(previewPages);
  expect(first.info.width).toBeCloseTo(A4.w, 0);
  expect(first.info.height).toBeCloseTo(A4.h, 0);
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled(); // ready for the next one

  // ---- unsaved design changes are saved first: what is downloaded is what is on screen -------------------------
  await choose(page, "Paper", "Letter");
  await choose(page, "Orientation", "Landscape");
  await settled(page);
  const landscapePages = await pages(page).count();
  await expect(status(page)).toHaveAttribute("data-state", "unsaved");
  const second = await downloadPdf(page);
  await expect(status(page)).toHaveAttribute("data-state", "saved");
  await expect(saveButton(page)).toBeDisabled();
  expect(second.info.pages).toBe(landscapePages);
  expect(second.info.width).toBeCloseTo(LETTER.h, 0);
  expect(second.info.height).toBeCloseTo(LETTER.w, 0);

  // ---- and the same file comes from the address itself, as an attachment ---------------------------------------
  const url = `${builder}/document/pdf`;
  const direct = await page.request.get(url);
  expect(direct.status()).toBe(200);
  expect(direct.headers()["content-type"]).toBe("application/pdf");
  expect(direct.headers()["content-disposition"]).toMatch(
    /^attachment; filename="Export run\.pdf"/,
  );
  expect(direct.headers()["cache-control"]).toContain("no-store");
  expect((await inspectPdf(await direct.body())).pageCount).toBe(landscapePages);

  // ---- exporting is part of the session's history ---------------------------------------------------------------
  await page.goto("/dashboard");
  await expect(page.getByText("Session exported").first()).toBeVisible();
});

test("a PDF belongs to whoever may see the session: signed out, or another account, gets nothing", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await signedIn(page, "Owner");
  const builder = await buildSession(page, "Private export", [["five-spot", "Five-Spot Shooting"]]);
  const url = `${builder}/document/pdf`;
  expect((await page.request.get(url)).status()).toBe(200);

  // another signed-in account: the session is not there for them
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signedIn(page2, "Other");
  const denied = await page2.request.get(url);
  expect(denied.status()).toBe(404);
  expect(await denied.json()).toEqual({ error: { code: "NOT_FOUND" } });
  expect(denied.headers()["content-type"]).not.toContain("pdf");
  await other.close();

  // signed out entirely
  const anonymous = await browser.newContext();
  const bare = await anonymous.request.get(new URL(url, page.url()).toString());
  expect(bare.status()).toBe(401);
  expect(await bare.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
  await anonymous.close();

  // an unknown session and a made-up sport are just not found
  expect(
    (
      await page.request.get(
        "/sessions/basketball/0b6f6f4e-6c0f-4b39-8f6e-0d5d7b1c2a10/document/pdf",
      )
    ).status(),
  ).toBe(404);
  expect((await page.request.get(url.replace("/basketball/", "/curling/"))).status()).toBe(404);
  expect((await page.request.get("/sessions/basketball/not-a-uuid/document/pdf")).status()).toBe(
    404,
  );
});

test("the download button: loading state, one request per click, and honest errors", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page);
  const builder = await buildSession(page, "States run", [["five-spot", "Five-Spot Shooting"]]);
  await openDesign(page, builder);
  const button = page.getByRole("button", { name: "Download PDF" });

  // ---- loading, and duplicate-request protection: a double click makes one file --------------------------------
  let requests = 0;
  await page.route("**/document/pdf", async (route) => {
    requests += 1;
    await new Promise((r) => setTimeout(r, 1200)); // slow enough to see the busy state
    await route.continue();
  });
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await button.click();
  await expect(page.getByRole("button", { name: "Preparing PDF…" })).toBeDisabled();
  await button.click({ force: true, timeout: 500 }).catch(() => undefined); // a second click while it is working
  await page.getByRole("button", { name: "Preparing PDF…" }).dispatchEvent("click");
  await download;
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  await page.waitForTimeout(500);
  expect(requests, "requests for one click").toBe(1);
  await page.unroute("**/document/pdf");

  // ---- every failure is said in words, and the button comes back ---------------------------------------------------
  const failures: Array<[status: number, code: string, message: string]> = [
    [404, "NOT_FOUND", "We couldn't find that."],
    [503, "UNAVAILABLE", "That isn’t available on this server right now."],
    [429, "RATE_LIMITED", "Too many requests. Please wait a moment and try again."],
    [401, "UNAUTHENTICATED", "Please sign in again."],
    [500, "INTERNAL", "Something went wrong on our side. Please try again."],
  ];
  for (const [statusCode, code, message] of failures) {
    await page.route("**/document/pdf", (route) =>
      route.fulfill({
        status: statusCode,
        contentType: "application/json",
        body: JSON.stringify({ error: { code } }),
      }),
    );
    await button.click();
    await expect(toast(page, message)).toBeVisible();
    await expect(button).toBeEnabled();
    await page.unroute("**/document/pdf");
  }
  await page.route("**/document/pdf", (route) => route.abort("connectionrefused"));
  await button.click();
  await expect(
    toast(page, "We couldn't reach the server. Check your connection and try again."),
  ).toBeVisible();
  await expect(button).toBeEnabled();
  await page.unroute("**/document/pdf");
});

test("a session that is deleted while its design screen is open is reported, not exported", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signedIn(page);
  const builder = await buildSession(page, "Deleted meanwhile", [
    ["five-spot", "Five-Spot Shooting"],
  ]);
  await openDesign(page, builder);
  // delete it from the sessions list in the same browser session
  const design = page;
  const other = await page.context().newPage();
  await other.goto("/sessions/basketball");
  await other.getByRole("button", { name: "Delete Deleted meanwhile" }).click();
  await other.getByRole("dialog").getByRole("button", { name: "Delete session" }).click();
  await expect(other.getByRole("article", { name: "Deleted meanwhile" })).toHaveCount(0);
  await other.close();

  await design.getByRole("button", { name: "Download PDF" }).click();
  await expect(toast(design, "We couldn't find that.")).toBeVisible();
  expect((await design.request.get(`${builder}/document/pdf`)).status()).toBe(404);
});
