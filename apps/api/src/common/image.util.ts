/**
 * Reads real pixel dimensions straight from a PNG/JPEG/WebP buffer's own
 * header bytes — deliberately hand-rolled rather than a general-purpose
 * image-parsing dependency. The only such package with matching license and
 * upkeep (`image-size`) carries unfixed high-severity DoS advisories in its
 * ICNS/JXL/HEIF parsers — formats this endpoint never accepts anyway, but
 * `npm audit` flags the whole package, and CLAUDE.md requires a clean audit.
 * Reading three well-documented, stable binary headers is a small, closed
 * amount of code by comparison, and doubles as the real (magic-byte) file
 * type check — multer's reported `mimetype` is client-supplied and proves
 * nothing on its own.
 *
 * Shared by every image upload in this codebase (tenant logos, product and
 * product-variant photos) — not `tenant`-specific despite its origin there.
 *
 * Returns `null` for anything that isn't a well-formed PNG, JPEG or WebP —
 * callers must treat that as rejection, not as "unknown, allow it".
 */
export interface DetectedImage {
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
}

export function detectImage(buffer: Buffer): DetectedImage | null {
  return detectPng(buffer) ?? detectJpeg(buffer) ?? detectWebp(buffer);
}

function detectPng(buf: Buffer): DetectedImage | null {
  // 8-byte PNG signature, then an IHDR chunk that starts at byte 12 (4-byte
  // length + "IHDR") with width/height as big-endian uint32 right after.
  if (
    buf.length < 24 ||
    buf.readUInt32BE(0) !== 0x89504e47 ||
    buf.readUInt32BE(4) !== 0x0d0a1a0a ||
    buf.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return null;
  }
  return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function detectJpeg(buf: Buffer): DetectedImage | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    // Markers with no length-prefixed payload: standalone RST/TEM/SOI bytes.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > buf.length) {
      return null;
    }
    const length = buf.readUInt16BE(offset + 2);
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (offset + 9 > buf.length) {
        return null;
      }
      return { format: "jpeg", height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function detectWebp(buf: Buffer): DetectedImage | null {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunkId = buf.toString("ascii", 12, 16);

  if (chunkId === "VP8X") {
    // Extended format: canvas width/height are 24-bit little-endian, minus 1.
    const width = read24LE(buf, 24) + 1;
    const height = read24LE(buf, 27) + 1;
    return { format: "webp", width, height };
  }
  if (chunkId === "VP8 ") {
    // Lossy bitstream: a 3-byte frame tag, a 3-byte start code, then 14-bit width/height.
    if (buf.length < 30 || buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) {
      return null;
    }
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { format: "webp", width, height };
  }
  if (chunkId === "VP8L") {
    // Lossless bitstream: a 1-byte signature (0x2f), then packed 14-bit width-1/height-1.
    if (buf[20] !== 0x2f) {
      return null;
    }
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | (b1 >> 6));
    return { format: "webp", width, height };
  }
  return null;
}

function read24LE(buf: Buffer, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
}
