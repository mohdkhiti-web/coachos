import { crc32, deflateSync } from "node:zlib";

/**
 * Real image bytes for tests, built from nothing (no image library): a decodable PNG in any size and colour, optionally
 * carrying metadata chunks a logo must NOT keep, and a structurally valid JPEG carrying EXIF (with a GPS marker).
 * Used only by tests (unit, database and browser).
 */

const chunk = (type: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const body = Buffer.concat([head.subarray(4), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, data, tail]);
};

export interface PngOptions {
  width?: number;
  height?: number;
  /** RGBA fill. */
  color?: [number, number, number, number];
  /** Add tEXt / eXIf / tIME chunks (metadata that must be stripped). */
  metadata?: boolean;
  /** Bytes after IEND (must be refused). */
  trailing?: Buffer;
  /** Claim the size in the header but carry no pixels: a structurally valid stand-in for very large images. */
  headerOnly?: boolean;
}

export function makePng(o: PngOptions = {}): Buffer {
  const width = o.width ?? 64;
  const height = o.height ?? 64;
  const [r, g, b, a] = o.color ?? [194, 65, 12, 255];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x++) row.set([r, g, b, a], 1 + x * 4);
  const raw = o.headerOnly
    ? Buffer.alloc(1)
    : Buffer.concat(Array.from({ length: height }, () => row));
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
  ];
  if (o.metadata) {
    parts.push(chunk("tEXt", Buffer.from("Author\0Somebody Private")));
    parts.push(chunk("eXIf", Buffer.from("GPS-LATITUDE-SECRET")));
    parts.push(chunk("tIME", Buffer.from([0x07, 0xe9, 1, 1, 0, 0, 0])));
  }
  parts.push(chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)));
  if (o.trailing) parts.push(o.trailing);
  return Buffer.concat(parts);
}

export interface JpegOptions {
  width?: number;
  height?: number;
  /** Add an EXIF (APP1) segment with a GPS marker and a comment: metadata that must be stripped. */
  metadata?: boolean;
  /** Leave out the closing EOI (must be refused). */
  truncated?: boolean;
}

const segment = (marker: number, body: Buffer) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
};

/** Structurally valid (markers, lengths, dimensions, scan, EOI); not meant to be decoded into a picture. */
export function makeJpeg(o: JpegOptions = {}): Buffer {
  const width = o.width ?? 64;
  const height = o.height ?? 64;
  const sof = Buffer.alloc(15);
  sof[0] = 8;
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof[5] = 3;
  sof.set([1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 6);
  const parts = [
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
  ];
  if (o.metadata) {
    parts.push(
      segment(0xe1, Buffer.from("Exif\0\0GPSLatitude=48.8566;GPSLongitude=2.3522", "latin1")),
    );
    parts.push(segment(0xfe, Buffer.from("made by someone private", "latin1")));
  }
  parts.push(segment(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 8)])));
  parts.push(segment(0xc0, sof));
  parts.push(segment(0xc4, Buffer.concat([Buffer.from([0]), Buffer.alloc(16), Buffer.from([0])])));
  parts.push(segment(0xda, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0])));
  parts.push(Buffer.from([0x12, 0x34, 0x56, 0x78]));
  if (!o.truncated) parts.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

/** A plain outlined SVG logo: a circle and a path. */
export const SIMPLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- exported by a tool -->
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60" class="logo" data-name="x">
  <title>Team logo</title>
  <defs><linearGradient id="g1"><stop offset="0" stop-color="#c2410c"/><stop offset="1" stop-color="#1f3a5f"/></linearGradient></defs>
  <g fill="url(#g1)" transform="translate(2 2)"><circle cx="28" cy="28" r="26"/><path d="M60 8 L112 8 L112 52 L60 52 Z" stroke="#111" stroke-width="2"/></g>
</svg>`;
