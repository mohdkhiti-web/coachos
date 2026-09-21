import { crc32 } from "node:zlib";

/**
 * A minimal ZIP writer (store, no compression), enough to hand over a set of PNG pages as one download. PNGs are
 * already compressed, so "stored" entries lose nothing. Pure: buffers in, one buffer out. UTF-8 file names (flag bit 11).
 */

export interface ZipEntry {
  name: string;
  data: Buffer;
  /** Modification time; defaults to now. */
  time?: Date;
}

const dos = (d: Date) => ({
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

/** A name safe to store: no path separators, no traversal, no control characters. */
export const zipName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "_")
    .slice(0, 120) || "file";

export function createZip(entries: ZipEntry[]): Buffer {
  if (entries.length === 0 || entries.length > 0xfffe) throw new Error("zip: bad entry count");
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    const name = zipName(entry.name);
    if (seen.has(name)) throw new Error(`zip: duplicate entry ${name}`);
    seen.add(name);
    const nameBytes = Buffer.from(name, "utf8");
    const { time, date } = dos(entry.time ?? new Date());
    const crc = crc32(entry.data);
    if (entry.data.length > 0xfffffffe) throw new Error("zip: entry too large");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6); // needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + entry.data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

/** Read back what `createZip` wrote (for tests and integrity checks): names and stored bytes, CRCs verified. */
export function readZip(buf: Buffer): Array<{ name: string; data: Buffer }> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("zip: no end record");
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const out: Array<{ name: string; data: Buffer }> = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error("zip: bad central header");
    const crc = buf.readUInt32LE(pos + 16);
    const size = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const local = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    if (crc32(data) !== crc) throw new Error(`zip: bad checksum for ${name}`);
    out.push({ name, data });
    pos += 46 + nameLen;
  }
  return out;
}
