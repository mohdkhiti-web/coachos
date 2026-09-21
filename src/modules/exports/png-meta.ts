import { crc32 } from "node:zlib";

/**
 * A PNG export's properties: how big it is on paper (so it prints at true size) and what it is. Inserts a `pHYs` chunk
 * (pixels per metre, from the device scale) and two `tEXt` chunks (Title, Software) right after the header. Only what is
 * printed on the document goes in — never an id, an address or a workspace name.
 */

const chunk = (type: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
};

const latin1 = (s: string) => s.replace(/[^ -~¡-ÿ]/g, "?").slice(0, 200);

export function stampPng(png: Buffer, opts: { title: string; dpi: number }): Buffer {
  if (png.length < 33 || png.toString("latin1", 1, 4) !== "PNG") throw new Error("not a PNG");
  const ihdrEnd = 8 + 12 + 13; // signature + IHDR chunk (length, type, 13 bytes, crc)
  const perMetre = Math.round(opts.dpi / 0.0254);
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(perMetre, 0);
  phys.writeUInt32BE(perMetre, 4);
  phys[8] = 1; // metres
  const text = (key: string, value: string) =>
    chunk("tEXt", Buffer.from(`${key}\0${latin1(value)}`, "latin1"));
  return Buffer.concat([
    png.subarray(0, ihdrEnd),
    chunk("pHYs", phys),
    text("Title", opts.title),
    text("Software", "CoachOS"),
    png.subarray(ihdrEnd),
  ]);
}
