import { describe, expect, it } from "vitest";
import { inspectLogo, logoLabel, MAX_LOGO_BYTES } from "./image";
import { sanitizeSvg } from "./svg";
import { makeJpeg, makePng, SIMPLE_SVG } from "./test-support";

const bytes = (s: string) => new TextEncoder().encode(s);
const svg = (inner: string, attrs = 'width="100" height="50"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

describe("PNG logos", () => {
  it("accepts a real PNG and reports its size", () => {
    const r = inspectLogo(makePng({ width: 120, height: 80 }));
    expect(r).toMatchObject({ ok: true, mime: "image/png", width: 120, height: 80 });
  });

  it("strips text, EXIF and time chunks: metadata never survives", () => {
    const dirty = makePng({ metadata: true });
    expect(dirty.toString("latin1")).toContain("GPS-LATITUDE-SECRET");
    const r = inspectLogo(dirty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = r.bytes.toString("latin1");
    for (const secret of ["GPS-LATITUDE-SECRET", "Somebody Private", "tEXt", "eXIf", "tIME"])
      expect(out, secret).not.toContain(secret);
    expect(out).toContain("IDAT");
    expect(inspectLogo(r.bytes)).toMatchObject({ ok: true, width: 64, height: 64 }); // and it is still a valid PNG
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses corrupt structure: a bad checksum, truncation, bytes after the end, a wrong first chunk", () => {
    const good = makePng();
    const flipped = Buffer.from(good);
    flipped[good.length - 20] = ~flipped[good.length - 20]! & 0xff; // inside IDAT
    expect(inspectLogo(flipped)).toEqual({ ok: false, reason: "corrupt" });
    expect(inspectLogo(good.subarray(0, good.length - 7))).toEqual({
      ok: false,
      reason: "corrupt",
    });
    expect(inspectLogo(makePng({ trailing: Buffer.from("<script>alert(1)</script>") }))).toEqual({
      ok: false,
      reason: "corrupt",
    });
    const noHeader = Buffer.concat([good.subarray(0, 8), good.subarray(33)]);
    expect(inspectLogo(noHeader)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("bounds the dimensions", () => {
    expect(inspectLogo(makePng({ width: 8, height: 64 }))).toEqual({
      ok: false,
      reason: "dimensions",
    });
    expect(inspectLogo(makePng({ width: 4097, height: 64 }))).toEqual({
      ok: false,
      reason: "dimensions",
    });
    expect(inspectLogo(makePng({ width: 16, height: 16 })).ok).toBe(true);
    expect(inspectLogo(makePng({ width: 4096, height: 16 })).ok).toBe(true);
  });
});

describe("JPEG logos", () => {
  it("accepts a JPEG and reports its size", () => {
    expect(inspectLogo(makeJpeg({ width: 200, height: 100 }))).toMatchObject({
      ok: true,
      mime: "image/jpeg",
      width: 200,
      height: 100,
    });
  });

  it("strips EXIF (GPS) and comments", () => {
    const dirty = makeJpeg({ metadata: true });
    expect(dirty.toString("latin1")).toContain("GPSLatitude");
    const r = inspectLogo(dirty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = r.bytes.toString("latin1");
    for (const secret of ["GPSLatitude", "Exif", "someone private"])
      expect(out, secret).not.toContain(secret);
    expect(out).toContain("JFIF");
    expect(inspectLogo(r.bytes)).toMatchObject({ ok: true, width: 64, height: 64 });
  });

  it("refuses a truncated file and a file with no frame header", () => {
    expect(inspectLogo(makeJpeg({ truncated: true }))).toEqual({ ok: false, reason: "corrupt" });
    expect(inspectLogo(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toEqual({
      ok: false,
      reason: "corrupt",
    });
    expect(inspectLogo(makeJpeg({ width: 10, height: 10 }))).toEqual({
      ok: false,
      reason: "dimensions",
    });
  });
});

describe("what is not a logo", () => {
  it("is decided by the bytes, not the name: HTML, scripts, executables, PDFs, GIFs, empty files", () => {
    for (const input of [
      bytes("<html><script>alert(1)</script></html>"),
      bytes("GIF89a\u0001\u0000\u0001\u0000"),
      Buffer.from("%PDF-1.7\n"),
      Buffer.from("MZ\u0090\u0000\u0003"),
      bytes("just text"),
    ])
      expect(inspectLogo(input), String(input.slice(0, 12))).toEqual({
        ok: false,
        reason: "unsupported_type",
      });
    expect(inspectLogo(new Uint8Array(0))).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses anything over 1 MiB before parsing it", () => {
    const big = Buffer.concat([makePng(), Buffer.alloc(MAX_LOGO_BYTES)]);
    expect(inspectLogo(big)).toEqual({ ok: false, reason: "too_large" });
  });

  it("a PNG that claims to be something else, and a script with a PNG name, are judged by content", () => {
    expect(inspectLogo(makePng()).ok).toBe(true);
    expect(inspectLogo(bytes("<script>x</script>"))).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
  });
});

describe("SVG logos", () => {
  it("accepts plain shapes, gradients and groups, and writes them out again from the parsed form", () => {
    const r = sanitizeSvg(bytes(SIMPLE_SVG));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({ width: 120, height: 60 });
    expect(r.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(r.svg).toContain("<linearGradient");
    expect(r.svg).toContain('fill="url(#g1)"');
    for (const gone of ["<title", "exported by a tool", "class=", "data-name", "<?xml"])
      expect(r.svg, gone).not.toContain(gone);
    expect(sanitizeSvg(bytes(r.svg))).toMatchObject({ ok: true, svg: r.svg }); // stable: parsing its own output changes nothing
  });

  it("goes through the same inspection as an upload (the size is normalised, the type is SVG)", () => {
    expect(inspectLogo(bytes(SIMPLE_SVG))).toMatchObject({
      ok: true,
      mime: "image/svg+xml",
      width: 256,
      height: 128,
    });
    expect(
      inspectLogo(bytes(svg('<rect width="10" height="40"/>', 'width="10" height="40"'))),
    ).toMatchObject({ ok: true, width: 64, height: 256 });
  });

  it("uses the viewBox when there is no width and height", () => {
    const r = sanitizeSvg(bytes(svg('<rect width="10" height="10"/>', 'viewBox="0 0 48 24"')));
    expect(r).toMatchObject({ ok: true, width: 48, height: 24 });
    expect(sanitizeSvg(bytes(svg("<rect/>", "")))).toEqual({
      ok: false,
      reason: "no_size",
      detail: undefined,
    });
  });

  const refused: Array<[string, string]> = [
    ["a script element", svg('<script>alert(1)</script><rect width="1" height="1"/>')],
    ["a script in a group", svg("<g><script>alert(1)</script></g>")],
    [
      "foreignObject",
      svg('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'),
    ],
    ["an image element", svg('<image href="https://evil.example/x.png"/>')],
    ["use", svg('<use href="#a"/>')],
    ["a style element", svg("<style>rect{fill:red}</style>")],
    ["text", svg("<text>hello</text>")],
    ["a link", svg('<a href="javascript:alert(1)"><rect width="1" height="1"/></a>')],
    ["an animation", svg('<rect width="1" height="1"><animate attributeName="x" to="5"/></rect>')],
    ["a filter", svg('<filter id="f"><feGaussianBlur/></filter>')],
    ["an onload handler", svg('<rect width="1" height="1" onclick="alert(1)"/>')],
    [
      "onload on the root",
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"></svg>`,
    ],
    ["a style attribute", svg('<rect width="1" height="1" style="fill:red"/>')],
    ["an href attribute", svg('<rect width="1" height="1" href="https://evil.example/"/>')],
    ["an xlink href", svg('<rect width="1" height="1" xlink:href="https://evil.example/"/>')],
    ["a javascript: value", svg('<rect width="1" height="1" fill="javascript:alert(1)"/>')],
    [
      "a url() to elsewhere",
      svg('<rect width="1" height="1" fill="url(https://evil.example/x)"/>'),
    ],
    ["a reference to nothing", svg('<rect width="1" height="1" fill="url(#missing)"/>')],
    [
      "a DOCTYPE with an entity",
      `<!DOCTYPE svg [<!ENTITY x "boom">]>${svg('<rect width="1" height="1"/>')}`,
    ],
    ["CDATA", svg("<![CDATA[x]]>")],
    [
      "a processing instruction",
      `${svg('<rect width="1" height="1"/>')}<?xml-stylesheet href="x.css"?>`,
    ],
    ["an unknown entity", svg('<rect width="1" height="1" fill="&xxe;"/>')],
    ["text between shapes", svg('hello<rect width="1" height="1"/>')],
    ["a nested svg", svg('<svg width="1" height="1"/>')],
    ["a prefixed element", svg('<svg:rect width="1" height="1"/>')],
    ["a second root", `${svg("<rect/>")}${svg("<rect/>")}`],
    ["an unclosed element", '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g>'],
    ["a wrong namespace", '<svg xmlns="http://evil.example/ns" width="10" height="10"></svg>'],
    ["no namespace", '<svg width="10" height="10"></svg>'],
    ["script-ish path data", svg('<path d="M0 0 L10 10 alert(1)"/>')],
  ];
  for (const [label, input] of refused)
    it(`refuses ${label}`, () => {
      const r = sanitizeSvg(bytes(input));
      expect(r.ok, label).toBe(false);
    });

  it("refuses invalid UTF-8, a NUL byte, and files that are too large or too intricate", () => {
    expect(sanitizeSvg(Buffer.from([0x3c, 0x73, 0xff, 0xfe]))).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    expect(sanitizeSvg(bytes(svg("<rect/>") + "\u0000"))).toMatchObject({ ok: false });
    expect(sanitizeSvg(bytes(svg('<rect width="1" height="1"/>'.repeat(1600))))).toMatchObject({
      ok: false,
      reason: "too_complex",
    });
    let deep = "<rect/>";
    for (let i = 0; i < 20; i++) deep = `<g>${deep}</g>`;
    expect(sanitizeSvg(bytes(svg(deep)))).toMatchObject({ ok: false, reason: "too_complex" });
    expect(sanitizeSvg(bytes(svg(`<path d="${"M0 0 ".repeat(9000)}"/>`)))).toMatchObject({
      ok: false,
    });
  });

  it("escapes what it writes: an attribute value cannot break out of its quotes", () => {
    const r = sanitizeSvg(bytes(svg('<rect id="a" width="1" height="1"/>')));
    expect(r.ok && r.svg).toContain('id="a"');
    const evil = sanitizeSvg(bytes(svg('<rect id="a&quot;onload=&quot;x" width="1" height="1"/>')));
    expect(evil.ok).toBe(false); // an id is a plain identifier
  });
});

describe("logo names", () => {
  it("become a plain label: no path, no extension, no control or bidi characters, no markup", () => {
    expect(logoLabel("Riverside BC logo.png")).toBe("Riverside BC logo");
    expect(logoLabel("C:\\Users\\me\\Pictures\\crest.SVG")).toBe("crest");
    expect(logoLabel("../../etc/passwd")).toBe("passwd");
    expect(logoLabel("<img src=x onerror=alert(1)>.jpg")).toBe("img src=x onerror=alert(1)");
    expect(logoLabel("\u202egnp.exe")).toBe("gnp");
    expect(logoLabel("  .png ")).toBe("Logo");
    expect(logoLabel("x".repeat(300))).toHaveLength(80);
  });
});
