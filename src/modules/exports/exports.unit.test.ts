import { describe, expect, it } from "vitest";
import { browserCandidates, findBrowser } from "./browser";
import { asciiName, contentDisposition, pdfFileName, safeBaseName } from "./filename";
import { Gate, GateFull, RateWindow } from "./limits";

describe("file names", () => {
  it("makes a plain .pdf name from a title", () => {
    expect(pdfFileName("Tuesday practice")).toBe("Tuesday practice.pdf");
    expect(pdfFileName("U14 · 75 min: ball handling & finishing")).toBe(
      "U14 · 75 min ball handling & finishing.pdf",
    );
  });

  it("never lets a title reach a header or a path untouched", () => {
    for (const hostile of [
      "../../etc/passwd",
      "..\\..\\windows\\system32",
      'a"; filename="evil.exe',
      "line\r\nSet-Cookie: x=1",
      "\u202egnp.exe",
      "name\u0000.pdf",
      "...",
      "   ",
      "",
    ]) {
      const name = pdfFileName(hostile);
      expect(name, hostile).toMatch(/\.pdf$/);
      expect(name, hostile).not.toMatch(/[\r\n\0"\\/:*?<>|;]/);
      expect(name.startsWith("."), hostile).toBe(false);
      expect(/[\u202a-\u202e\u2066-\u2069]/.test(name), hostile).toBe(false);
    }
    expect(safeBaseName("...", "session")).toBe("session");
    expect(pdfFileName("   ")).toBe("session.pdf");
  });

  it("caps the length and keeps other scripts", () => {
    expect(safeBaseName("x".repeat(500), "s")).toHaveLength(80);
    expect(pdfFileName("Séance d’entraînement — U16")).toBe("Séance d’entraînement — U16.pdf");
    expect(pdfFileName("Тренировка")).toBe("Тренировка.pdf");
  });

  it("offers an ASCII fallback and the real name, encoded", () => {
    expect(asciiName("Séance d’entraînement.pdf")).toBe("Seance d_entrainement.pdf");
    const header = contentDisposition("Séance d’entraînement.pdf");
    expect(header).toBe(
      "attachment; filename=\"Seance d_entrainement.pdf\"; filename*=UTF-8''S%C3%A9ance%20d%E2%80%99entra%C3%AEnement.pdf",
    );
    expect(contentDisposition("it's (a) test*.pdf")).toContain("it%27s%20%28a%29%20test%2A.pdf");
    expect(contentDisposition("a.pdf")).toMatch(/^attachment; /);
  });
});

describe("finding a browser", () => {
  const win = {
    platform: "win32" as const,
    env: { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)" },
    pathDirs: [],
  };
  const linux = { platform: "linux" as const, env: {}, pathDirs: ["/usr/local/bin", "/usr/bin"] };
  const mac = { platform: "darwin" as const, env: {}, pathDirs: [] };

  it("knows the usual places on each system", () => {
    expect(browserCandidates(win).some((p) => p.endsWith("msedge.exe"))).toBe(true);
    expect(browserCandidates(win).some((p) => p.endsWith("chrome.exe"))).toBe(true);
    expect(browserCandidates(mac)[0]).toContain("Google Chrome");
    expect(browserCandidates(linux)).toContain("/usr/bin/chromium");
    expect(browserCandidates({ platform: "win32", env: {}, pathDirs: [] })).toEqual([]);
  });

  it("takes the first that exists, and reports none when none does", () => {
    const only = (file: string) => (p: string) => p === file;
    expect(findBrowser(linux, only("/usr/bin/chromium"))).toBe("/usr/bin/chromium");
    expect(findBrowser(linux, () => false)).toBeNull();
    expect(findBrowser(win, (p) => p.includes("Edge"))).toContain("msedge.exe");
  });

  it("an explicit path wins and is never quietly replaced by another browser", () => {
    const withPath = { ...linux, env: { PDF_BROWSER_PATH: "/opt/chrome/chrome" } };
    expect(findBrowser(withPath, () => true)).toBe("/opt/chrome/chrome");
    expect(findBrowser(withPath, (p) => p === "/usr/bin/chromium")).toBeNull();
    expect(
      findBrowser({ ...linux, env: { PDF_BROWSER_PATH: "  " } }, (p) => p === "/usr/bin/chromium"),
    ).toBe("/usr/bin/chromium");
  });
});

describe("the render gate", () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  };

  it("runs at most `limit` jobs at once and lets the rest wait in order", async () => {
    const gate = new Gate(2, 5);
    const order: string[] = [];
    const jobs = ["a", "b", "c", "d"].map((name) => ({ name, ...deferred() }));
    const running = jobs.map((j) =>
      gate.run(async () => {
        order.push(`start ${j.name}`);
        await j.promise;
        order.push(`end ${j.name}`);
      }),
    );
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["start a", "start b"]);
    expect(gate.running).toBe(2);
    expect(gate.queued).toBe(2);
    jobs[0]!.resolve();
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toContain("start c");
    expect(order).not.toContain("start d");
    jobs[1]!.resolve();
    jobs[2]!.resolve();
    jobs[3]!.resolve();
    await Promise.all(running);
    expect(gate.running).toBe(0);
    expect(gate.queued).toBe(0);
  });

  it("refuses at once when the queue is full", async () => {
    const gate = new Gate(1, 1);
    const hold = deferred();
    const first = gate.run(() => hold.promise);
    const second = gate.run(async () => "queued");
    await expect(gate.run(async () => "no room")).rejects.toBeInstanceOf(GateFull);
    hold.resolve();
    await first;
    await expect(second).resolves.toBe("queued");
  });

  it("frees the slot when a job fails", async () => {
    const gate = new Gate(1, 1);
    await expect(gate.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(gate.running).toBe(0);
    await expect(gate.run(async () => "fine")).resolves.toBe("fine");
  });
});

describe("the rate window", () => {
  it("allows `max` in the window, per person, and forgets after it", () => {
    const rate = new RateWindow(3, 1000);
    expect([1, 2, 3, 4].map(() => rate.allow("ann", 0))).toEqual([true, true, true, false]);
    expect(rate.allow("bob", 0)).toBe(true); // someone else is not affected
    expect(rate.allow("ann", 999)).toBe(false);
    expect(rate.allow("ann", 1000)).toBe(true); // the window has slid past the first hits
  });
});
