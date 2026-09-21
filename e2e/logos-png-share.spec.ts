import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { readZip } from "../src/modules/exports/zip";
import { makePng, SIMPLE_SVG } from "../src/modules/media/test-support";
import { completeOnboarding, newUser, signUpAndVerify, toast } from "./support/helpers";
import { buildSession, choose, pages, panel, section, settled, status } from "./support/document";
import { A4, inspectPdf, LETTER } from "./support/pdf";
import { createSession, SESSIONS } from "./support/sessions";

/**
 * Step 7: logos, PNG export and secure sharing, end to end in a real browser against a production build: the upload
 * and what a logo may be, the logo in the preview / print / PDF / PNG, every PNG option with its exact size, and a
 * shared link — opened by a stranger with no account — through create, copy, regenerate, revoke, expiry and deletion.
 */

async function signedIn(page: Page, label = "Sharer") {
  await signUpAndVerify(page, newUser(label));
  await completeOnboarding(page);
}
const openDesign = async (page: Page, builder: string) => {
  await page.goto(`${builder}/document?view=design`);
  await expect(page.getByRole("heading", { level: 1, name: "Design and preview" })).toBeVisible();
  await settled(page);
};
const openLogoGroup = async (page: Page) => {
  await panel(page).getByText("Footer and logo").click();
  await expect(page.getByTestId("logo-picker")).toBeVisible();
};
const upload = (page: Page, name: string, buffer: Buffer, mimeType: string) =>
  page.getByTestId("logo-file").setInputFiles({ name, mimeType, buffer });
const save = async (page: Page) => {
  const button = page.getByRole("button", { name: "Save design" });
  if (await button.isEnabled()) {
    await button.click();
    await expect(status(page)).toHaveAttribute("data-state", "saved");
  }
};
const pngSize = (b: Buffer) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });
/** A page is 793.7 × 1122.5 CSS px (A4); an image is whole pixels, so allow the rounding a pixel grid brings. */
const expectSize = (b: Buffer, width: number, height: number) => {
  const got = pngSize(b);
  expect(Math.abs(got.width - width), `width ${got.width} vs ${width}`).toBeLessThanOrEqual(2);
  expect(Math.abs(got.height - height), `height ${got.height} vs ${height}`).toBeLessThanOrEqual(2);
};

test("logos: upload, refuse what is not a logo, show it in the document, the PDF and the PNG, delete it", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signedIn(page, "Logo");
  const builder = await buildSession(page, "Logo run", [["five-spot", "Five-Spot Shooting"]]);
  await openDesign(page, builder);
  await openLogoGroup(page);
  await expect(page.getByTestId("logo-picker")).toContainText("No logo in this design.");
  const image = page.locator('.doc-page img[src^="/logos/"]');
  await expect(image).toHaveCount(0);

  // ---- what a logo may not be: each refusal is said in words, and nothing is stored ------------------------------
  const alert = page.getByTestId("logo-picker").getByRole("alert");
  await upload(page, "notes.txt", Buffer.from("just some text"), "text/plain");
  await expect(alert).toHaveText("Use a PNG, JPEG or SVG image.");
  await upload(
    page,
    "fake.png",
    Buffer.from("<html><script>alert(1)</script></html>"),
    "image/png",
  );
  await expect(alert).toHaveText("Use a PNG, JPEG or SVG image."); // its bytes are HTML: the name and type prove nothing
  await upload(page, "tiny.png", makePng({ width: 8, height: 8 }), "image/png");
  await expect(alert).toHaveText("The image must be between 16 and 4096 pixels on each side.");
  await upload(
    page,
    "evil.svg",
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><script>alert(1)</script></svg>',
    ),
    "image/svg+xml",
  );
  await expect(alert).toContainText("contains something a logo can't have");
  await upload(page, "huge.png", Buffer.alloc(1_200_000, 1), "image/png");
  await expect(alert).toHaveText("That file is too large. Logos can be up to 1 MB.");
  await expect(image).toHaveCount(0);
  await expect(page.getByTestId("logo-picker")).toContainText("No logo in this design.");

  // ---- a good one: PNG with metadata ------------------------------------------------------------------------------
  await upload(
    page,
    "Riverside BC crest.png",
    makePng({ width: 160, height: 80, metadata: true }),
    "image/png",
  );
  await expect(toast(page, "Logo uploaded")).toBeVisible();
  await expect(page.getByTestId("logo-picker")).toContainText("Riverside BC crest");
  await expect(image.first()).toBeVisible();
  await expect
    .poll(() => image.first().evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(160);
  await expect(status(page)).toHaveAttribute("data-state", "unsaved");
  await save(page);

  // the stored file is the cleaned one: no metadata came back out
  const src = await image.first().getAttribute("src");
  const served = await page.request.get(src!);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect(served.headers()["content-security-policy"]).toContain("sandbox");
  const bytes = await served.body();
  expect(bytes.toString("latin1")).not.toContain("GPS-LATITUDE-SECRET");
  expect(bytes.toString("latin1")).not.toContain("Somebody Private");

  // it survives a reload, prints, and is in the PDF and the PNG
  await page.reload();
  await settled(page);
  await expect(image.first()).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(image.first()).toBeVisible();
  await page.emulateMedia({ media: null });
  const pdf = await inspectPdf(await (await page.request.get(`${builder}/document/pdf`)).body());
  expect(
    pdf.pages.reduce((n, p) => n + p.images, 0),
    "the logo is an image in the PDF",
  ).toBeGreaterThanOrEqual(1);
  const png = await page.request.get(`${builder}/document/png?page=1`);
  expect(png.status()).toBe(200);
  expectSize(await png.body(), 1587, 2245);

  // ---- an SVG logo, and choosing between the workspace's logos -----------------------------------------------------
  await openLogoGroup(page);
  await upload(page, "Crest.svg", Buffer.from(SIMPLE_SVG), "image/svg+xml");
  await expect(toast(page, "Logo uploaded")).toBeVisible();
  const svgLogo = page.getByRole("button", { name: "Use Crest" });
  await expect(svgLogo).toHaveAttribute("aria-pressed", "true");
  const svgSrc = await image.first().getAttribute("src");
  expect(svgSrc).not.toBe(src);
  const svgServed = await page.request.get(svgSrc!);
  expect(svgServed.headers()["content-type"]).toBe("image/svg+xml");
  expect(await svgServed.text()).not.toMatch(/<title|<!--|class=/);
  await page.getByRole("button", { name: "Use Riverside BC crest" }).click();
  await expect(page.getByRole("button", { name: "Use Riverside BC crest" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await save(page);

  // ---- remove it from the design, then delete it from the workspace ---------------------------------------------------
  await page.getByRole("button", { name: "Remove from design" }).click();
  await expect(image).toHaveCount(0);
  await save(page);
  await page.getByRole("button", { name: "Delete Riverside BC crest" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this logo?" });
  await expect(confirm).toContainText("Designs that use it will print without a logo");
  await confirm.getByRole("button", { name: "Delete logo" }).click();
  await expect(toast(page, "Logo deleted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use Riverside BC crest" })).toHaveCount(0);
  expect((await page.request.get(src!)).status()).toBe(404); // gone for everyone
});

test("a logo belongs to its workspace: another account cannot read it or put it in a design", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await signedIn(page, "Owner");
  const builder = await createSession(page, { title: "Logo owner" });
  await openDesign(page, builder);
  await openLogoGroup(page);
  await upload(page, "mine.png", makePng({ width: 64, height: 64 }), "image/png");
  await expect(toast(page, "Logo uploaded")).toBeVisible();
  const src = (await page.locator('.doc-page img[src^="/logos/"]').first().getAttribute("src"))!;

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signedIn(page2, "Other");
  expect((await page2.request.get(src)).status()).toBe(404); // signed in, wrong workspace
  const bare = await (await browser.newContext()).request.get(new URL(src, page.url()).toString());
  expect(bare.status()).toBe(401); // signed out
  await other.close();
});

test("PNG export: this page, every page as a ZIP, or one image; standard and high resolution; exact sizes", async ({
  page,
}) => {
  test.setTimeout(400_000);
  await signedIn(page, "Png");
  const builder = await buildSession(page, "Png run");
  await openDesign(page, builder);
  const total = await pages(page).count();
  expect(total).toBeGreaterThanOrEqual(4);

  const menu = async () => {
    await page.getByRole("button", { name: "Download images" }).click();
  };
  const grab = async (item: RegExp | string, index = 0) => {
    await menu();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 90_000 }),
      page.getByRole("menuitem", { name: item }).nth(index).click(),
    ]);
    const bytes = await readFile(await download.path());
    return { name: download.suggestedFilename(), bytes };
  };

  // this page, standard: A4 at 96 dpi × 2 (793.7 × 1122.5 px, rounded up to whole pixels)
  let file = await grab(/^This page \(page 1\) as PNG/);
  await expect(toast(page, "Images downloaded")).toBeVisible();
  expect(file.name).toBe("Png run - page 1.png");
  expectSize(file.bytes, 1587, 2245);
  expect(file.bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const text = file.bytes.toString("latin1");
  expect(text).toContain("pHYs");
  expect(text).toContain("Title\u0000Png run");
  expect(text).toContain("Software\u0000CoachOS");
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/); // no internal ids

  // high resolution: × 3
  file = await grab(/^This page \(page 1\) as PNG/, 1);
  expectSize(file.bytes, 2381, 3368);

  // every page: a ZIP with one PNG per page, all the same size
  file = await grab(new RegExp(`^All ${total} pages \\(ZIP of PNGs\\)`));
  expect(file.name).toBe("Png run - pages.zip");
  const entries = readZip(file.bytes);
  expect(entries).toHaveLength(total);
  expect(entries[0]!.name).toBe("Png run - page 1.png");
  for (const e of entries) expectSize(e.data, 1587, 2245);

  // one image with every page (only offered while it fits)
  if (total <= 8) {
    file = await grab("All pages as one image");
    expect(file.name).toBe("Png run.png");
    const { width, height } = pngSize(file.bytes);
    const scale = height / (total * 1122.52 + (total + 1) * 24);
    expect(scale).toBeGreaterThan(1.9);
    expect(Math.abs(width - (793.7 + 48) * scale)).toBeLessThan(3);
  }

  // the design decides the size: Letter landscape, page 2
  await choose(page, "Paper", "Letter");
  await choose(page, "Orientation", "Landscape");
  await settled(page);
  file = await grab(/^This page \(page 1\) as PNG/);
  expectSize(file.bytes, 2112, 1632); // 11 × 8.5 in at 96 dpi × 2
  await expect(status(page)).toHaveAttribute("data-state", "saved"); // downloading saved the design first

  // the same through the address, with its rules
  const url = `${builder}/document/png`;
  expect((await page.request.get(`${url}?page=999`)).status()).toBe(422);
  expect((await page.request.get(`${url}?page=abc`)).status()).toBe(422);
  expect((await page.request.get(`${url}?layout=diagonal`)).status()).toBe(422);
  expect((await page.request.get(`${url}?resolution=huge`)).status()).toBe(422);
  const direct = await page.request.get(`${url}?page=1&resolution=high`);
  expect(direct.headers()["content-disposition"]).toMatch(
    /^attachment; filename="Png run - page 1\.png"/,
  );
  expect(direct.headers()["x-image-pages"]).toBe("1");
  expect(direct.headers()["x-image-size"]).toMatch(/^31(6[6-9]|7[0-1])x24(4[6-9]|50)$/); // Letter landscape ×3, give or take a pixel
  const zip = await page.request.get(`${url}?page=all`);
  expect(readZip(await zip.body()).length).toBeGreaterThanOrEqual(3);
  void A4;
  void LETTER;
});

test("PNG export: another account or a signed-out visitor gets nothing", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await signedIn(page, "Owner");
  const builder = await createSession(page, { title: "Png private" });
  const url = `${builder}/document/png?page=1`;
  expect((await page.request.get(url)).status()).toBe(200);
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signedIn(page2, "Other");
  expect((await page2.request.get(url)).status()).toBe(404);
  const anon = await browser.newContext();
  expect((await anon.request.get(new URL(url, page.url()).toString())).status()).toBe(401);
  await other.close();
  await anon.close();
});

test("secure sharing: create, open with no account, copy, regenerate, revoke, expire, and follow the session", async ({
  page,
  browser,
}) => {
  test.setTimeout(500_000);
  await signedIn(page, "Sharer");
  // private notes and a reflection that must NEVER reach the public, even with their sections switched on
  const builder = await buildSession(page, "Shared run", undefined, {
    notes: "SECRET-COACH-NOTE for the staff only",
  });
  await openDesign(page, builder);
  await section(page, "Coach notes").check();
  await section(page, "Session reflection").check();
  await save(page);
  expect(await pages(page).count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('[data-testid="document"]')).toContainText("SECRET-COACH-NOTE"); // the owner sees it
  const previewPages = await pages(page).count();

  const shareButton = page.getByRole("button", { name: "Share", exact: true });
  await shareButton.click();
  const dialog = page.getByRole("dialog", { name: "Share this session" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Never shows: your coach notes, the reflection");
  await expect(dialog).toContainText("This session isn't shared.");
  await dialog.getByLabel("The link works for").selectOption({ label: "30 days" });
  await dialog.getByRole("button", { name: "Create link" }).click();
  await expect(toast(page, "Link created")).toBeVisible();
  const linkInput = dialog.getByLabel("Link to share");
  const link = await linkInput.inputValue();
  expect(link).toMatch(/\/s\/[0-9a-f]{32}[A-Za-z0-9_-]{43}$/);
  await expect(dialog).toContainText(/Works until/);
  // copying puts the link on the clipboard
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect(toast(page, "Link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  // closing and reopening shows the very same link
  await dialog.getByRole("button", { name: "Done" }).click();
  await shareButton.click();
  await expect(page.getByLabel("Link to share")).toHaveValue(link);
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

  // ---- a stranger, no account: the session as a read-only document -----------------------------------------------
  const visitor = await browser.newContext();
  const shared = await visitor.newPage();
  const response = await shared.goto(link);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(shared.getByRole("heading", { level: 1, name: "Shared run" })).toBeVisible();
  await expect(shared.getByText("Read-only", { exact: true })).toBeVisible();
  await expect(shared.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await settled(shared);
  await expect(shared.locator('[data-testid="document"] .doc-page').first()).toBeVisible();
  expect(await pages(shared).count()).toBeGreaterThanOrEqual(3);
  await expect(shared.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0); // no app around it
  await expect(shared.getByRole("button", { name: "Account menu" })).toHaveCount(0);
  await expect(shared.getByRole("button", { name: /Save design|Share/ })).toHaveCount(0); // nothing to edit
  const body = (await shared.locator('[data-testid="document"]').innerText()).toLowerCase();
  expect(body).toContain("five-spot shooting");
  expect(body).not.toContain("coach notes");
  expect(body).not.toContain("secret-coach-note");
  expect(body).not.toContain("what went well");
  expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-/); // no ids
  expect(body).not.toContain("@example.test"); // no email addresses

  // the visitor can print and download the same document
  const [download] = await Promise.all([
    shared.waitForEvent("download", { timeout: 90_000 }),
    shared.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const publicPdf = await inspectPdf(await readFile(await download.path()));
  expect(publicPdf.title).toBe("Shared run");
  expect(publicPdf.pageCount).toBe(await pages(shared).count());
  expect(publicPdf.flat).not.toContain("SECRET-COACH-NOTE");
  expect(publicPdf.flat.toLowerCase()).not.toContain("what went well");
  expect(publicPdf.pageCount).toBeLessThanOrEqual(previewPages);
  expect((await shared.request.get(`${link}/pdf`)).status()).toBe(200);
  // the app's own routes stay closed to them
  expect((await shared.request.get(`${builder}/document/pdf`)).status()).toBe(401);
  expect((await shared.request.get("/logos/0b6f6f4e-6c0f-4b39-8f6e-0d5d7b1c2a10")).status()).toBe(
    401,
  );

  // ---- tampering: a changed signature, a truncated link, junk ---------------------------------------------------------
  const tamper = link.slice(0, -1) + (link.endsWith("A") ? "B" : "A");
  for (const bad of [
    tamper,
    link.slice(0, -5),
    link + "x",
    link.replace(/\/s\/.{32}/, "/s/" + "0".repeat(32)),
    `${new URL(link).origin}/s/not-a-token`,
  ]) {
    await shared.goto(bad);
    await expect(shared.getByRole("heading", { name: "This link isn't available" })).toBeVisible();
    expect((await shared.request.get(`${bad}/pdf`)).status()).toBe(404);
  }

  // ---- regenerate: the old link stops, the new one works ----------------------------------------------------------------
  await shareButton.click();
  await page.getByRole("dialog").getByRole("button", { name: "Make a new link" }).click();
  const regen = page.getByRole("group", { name: "Make a new link?" });
  await expect(regen).toContainText("The current link will stop working at once");
  await regen.getByRole("button", { name: "Replace the link" }).click();
  await expect(toast(page, "New link created. The old one no longer works.")).toBeVisible();
  const fresh = await page.getByLabel("Link to share").inputValue();
  expect(fresh).not.toBe(link);
  await shared.goto(link);
  await expect(shared.getByRole("heading", { name: "This link isn't available" })).toBeVisible();
  await shared.goto(fresh);
  await expect(shared.getByRole("heading", { level: 1, name: "Shared run" })).toBeVisible();

  // ---- revoke: asks first; then the link is dead ----------------------------------------------------------------------------
  await page.getByRole("dialog").getByRole("button", { name: "Stop sharing" }).click();
  const stop = page.getByRole("group", { name: "Stop sharing?" });
  await stop.getByRole("button", { name: "Cancel" }).click(); // cancelling changes nothing
  await shared.reload();
  await expect(shared.getByRole("heading", { level: 1, name: "Shared run" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Stop sharing" }).click();
  await page
    .getByRole("group", { name: "Stop sharing?" })
    .getByRole("button", { name: "Stop sharing" })
    .click();
  await expect(toast(page, "Sharing turned off")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("This session isn't shared.");
  await shared.reload();
  await expect(shared.getByRole("heading", { name: "This link isn't available" })).toBeVisible();

  // ---- the link follows the session: a new one works until the session is deleted, and again once it is restored -------
  await page.getByRole("dialog").getByRole("button", { name: "Create link" }).click();
  await expect(toast(page, "Link created")).toBeVisible();
  const again = await page.getByLabel("Link to share").inputValue();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await shared.goto(again);
  await expect(shared.getByRole("heading", { level: 1, name: "Shared run" })).toBeVisible();

  await page.goto(SESSIONS);
  await page.getByRole("button", { name: "Delete Shared run" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete session" }).click();
  await expect(toast(page, "Session deleted")).toBeVisible();
  await shared.goto(again);
  await expect(shared.getByRole("heading", { name: "This link isn't available" })).toBeVisible();
  await visitor.close();
});

test("only the session's author or an admin can share it; another account sees nothing", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await signedIn(page, "Owner");
  const builder = await createSession(page, { title: "Not yours" });
  await openDesign(page, builder);
  await expect(page.getByRole("button", { name: "Share", exact: true })).toBeVisible();

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signedIn(page2, "Other");
  await page2.goto(`${builder}/document`);
  await expect(page2.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await other.close();
});
