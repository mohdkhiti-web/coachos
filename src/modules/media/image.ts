import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import type { LogoMime } from "@/db/enums";
import { sanitizeSvg, type SvgReason } from "./svg";

/**
 * Inspecting an uploaded logo (Step 7): pure functions from bytes to a verdict. Nothing is trusted from the request —
 * not the file name, not the declared type. The signature decides the type; the structure is walked; the dimensions and
 * size are bounded; and what is kept is REWRITTEN without metadata (EXIF/GPS, text chunks, comments), so a logo can
 * never carry a photographer's location or a hidden payload into a document or a shared page.
 */

export const MAX_LOGO_BYTES = 1_048_576; // 1 MiB
export const MIN_LOGO_SIDE = 16;
export const MAX_LOGO_SIDE = 4096;
const MAX_PIXELS = 16_777_216; // 4096 × 4096

export type LogoReason =
  "empty" | "too_large" | "unsupported_type" | "corrupt" | "dimensions" | `svg_${SvgReason}`;

export type LogoInspection =
  | {
      ok: true;
      mime: LogoMime;
      width: number;
      height: number;
      bytes: Buffer;
      sha256: string;
    }
  | { ok: false; reason: LogoReason };

const fail = (reason: LogoReason): LogoInspection => ({ ok: false, reason });
const done = (mime: LogoMime, width: number, height: number, bytes: Buffer): LogoInspection => {
  if (
    width < MIN_LOGO_SIDE ||
    height < MIN_LOGO_SIDE ||
    width > MAX_LOGO_SIDE ||
    height > MAX_LOGO_SIDE
  )
    return fail("dimensions");
  if (width * height > MAX_PIXELS) return fail("dimensions");
  return {
    ok: true,
    mime,
    width,
    height,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};

// ---- PNG ----------------------------------------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Chunks that describe the picture. Everything else (text, time, physical size, EXIF, animation) is dropped. */
const PNG_KEEP = new Set([
  "IHDR",
  "PLTE",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "sBIT",
  "IDAT",
  "IEND",
]);

function inspectPng(input: Buffer): LogoInspection {
  let pos = PNG_SIGNATURE.length;
  const kept: Buffer[] = [PNG_SIGNATURE];
  let width = 0;
  let height = 0;
  let sawData = false;
  let sawEnd = false;
  let first = true;
  while (pos < input.length) {
    if (pos + 12 > input.length) return fail("corrupt");
    const length = input.readUInt32BE(pos);
    if (length > input.length) return fail("corrupt");
    const end = pos + 12 + length;
    if (end > input.length) return fail("corrupt");
    const type = input.toString("latin1", pos + 4, pos + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return fail("corrupt");
    const body = input.subarray(pos + 8, pos + 8 + length);
    if (crc32(input.subarray(pos + 4, pos + 8 + length)) !== input.readUInt32BE(pos + 8 + length))
      return fail("corrupt");
    if (first) {
      if (type !== "IHDR" || length !== 13) return fail("corrupt");
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[10] !== 0 || body[11] !== 0 || (body[12] !== 0 && body[12] !== 1))
        return fail("corrupt");
      first = false;
    }
    if (sawEnd) return fail("corrupt"); // nothing may follow IEND
    if (type === "IDAT") sawData = true;
    if (type === "IEND") {
      if (length !== 0) return fail("corrupt");
      sawEnd = true;
    }
    if (PNG_KEEP.has(type)) kept.push(input.subarray(pos, end));
    pos = end;
  }
  if (!sawData || !sawEnd) return fail("corrupt");
  return done("image/png", width, height, Buffer.concat(kept));
}

// ---- JPEG ---------------------------------------------------------------------------------------------------------

/** Kept: tables, frame header, restart interval, JFIF (APP0), ICC profile (APP2) and Adobe (APP14) colour info. Dropped: EXIF/XMP (APP1), comments, everything else. */
const JPEG_KEEP = (marker: number) =>
  marker === 0xdb ||
  marker === 0xc4 ||
  marker === 0xdd ||
  marker === 0xe0 ||
  marker === 0xe2 ||
  marker === 0xee ||
  isSof(marker);
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function inspectJpeg(input: Buffer): LogoInspection {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return fail("corrupt");
  const kept: Buffer[] = [input.subarray(0, 2)];
  let pos = 2;
  let width = 0;
  let height = 0;
  while (pos < input.length) {
    if (input[pos] !== 0xff) return fail("corrupt");
    while (input[pos] === 0xff) pos += 1; // fill bytes
    const marker = input[pos++];
    if (marker === undefined) return fail("corrupt");
    if (marker === 0xd9) return fail("corrupt"); // the image ended before any scan
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue; // markers without a length
    if (pos + 2 > input.length) return fail("corrupt");
    const length = input.readUInt16BE(pos);
    if (length < 2 || pos + length > input.length) return fail("corrupt");
    const segment = input.subarray(pos - 2, pos + length); // FF marker + length + body
    if (isSof(marker)) {
      if (length < 8) return fail("corrupt");
      height = input.readUInt16BE(pos + 3);
      width = input.readUInt16BE(pos + 5);
    }
    if (marker === 0xda) {
      // start of scan: the compressed data follows to the end of the file and must finish with EOI
      if (width === 0 || height === 0) return fail("corrupt");
      const rest = input.subarray(pos - 2);
      if (rest.length < 4 || rest[rest.length - 2] !== 0xff || rest[rest.length - 1] !== 0xd9)
        return fail("corrupt");
      kept.push(rest);
      return done("image/jpeg", width, height, Buffer.concat(kept));
    }
    if (JPEG_KEEP(marker)) kept.push(segment);
    pos += length;
  }
  return fail("corrupt");
}

// ---- entry point --------------------------------------------------------------------------------------------------

export function inspectLogo(bytes: Uint8Array): LogoInspection {
  if (bytes.length === 0) return fail("empty");
  if (bytes.length > MAX_LOGO_BYTES) return fail("too_large");
  const input = Buffer.from(bytes);
  if (input.subarray(0, 8).equals(PNG_SIGNATURE)) return check(inspectPng(input));
  if (input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return check(inspectJpeg(input));

  // SVG has no signature: it is text that starts (after optional BOM/whitespace/prolog) with a tag
  const head = input.subarray(0, 512).toString("utf8").replace(/^﻿/, "").trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!--")) {
    const svg = sanitizeSvg(input);
    if (!svg.ok) return fail(`svg_${svg.reason}`);
    // normalise the recorded size: the long side is 256, the other keeps the aspect (an SVG has no pixels of its own)
    const long = 256;
    const [w, h] =
      svg.width >= svg.height
        ? [long, Math.max(MIN_LOGO_SIDE, Math.round((long * svg.height) / svg.width))]
        : [Math.max(MIN_LOGO_SIDE, Math.round((long * svg.width) / svg.height)), long];
    return check(done("image/svg+xml", w, h, Buffer.from(svg.svg, "utf8")));
  }
  return fail("unsupported_type");
}

/** The rewritten file may be larger than the limit only if the input was already near it; never store more than allowed. */
function check(r: LogoInspection): LogoInspection {
  return r.ok && r.bytes.length > MAX_LOGO_BYTES ? fail("too_large") : r;
}

/** A label for the logo picker from the uploaded file's name: no extension, no path, no control characters. */
export function logoLabel(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .trim()
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, " ")
    .replace(/[<>"'`\\|;%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return cleaned || "Logo";
}
