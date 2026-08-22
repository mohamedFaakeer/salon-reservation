import { describe, expect, it } from "vitest";
import { detectImage } from "./logo-image.util";

function pngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function jpegBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(12);
  buf[0] = 0xff;
  buf[1] = 0xd8; // SOI
  buf[2] = 0xff;
  buf[3] = 0xc0; // SOF0
  buf.writeUInt16BE(8, 4); // segment length (unchecked by the parser)
  buf[6] = 8; // sample precision
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  return buf;
}

function webpExtendedBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(22, 4);
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8X", 12, "ascii");
  buf.writeUInt32LE(10, 16);
  buf[20] = 0;
  const w = width - 1;
  const h = height - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
}

describe("detectImage", () => {
  it("reads PNG width/height from the IHDR chunk", () => {
    expect(detectImage(pngBuffer(512, 384))).toEqual({ format: "png", width: 512, height: 384 });
  });

  it("reads JPEG width/height from the SOF0 marker", () => {
    expect(detectImage(jpegBuffer(800, 600))).toEqual({ format: "jpeg", width: 800, height: 600 });
  });

  it("reads WebP (VP8X, extended format) width/height", () => {
    expect(detectImage(webpExtendedBuffer(1024, 768))).toEqual({ format: "webp", width: 1024, height: 768 });
  });

  it("rejects an arbitrary buffer that matches no known signature", () => {
    expect(detectImage(Buffer.from("not an image at all, just text bytes here"))).toBeNull();
  });

  it("rejects a truncated PNG signature rather than reading garbage dimensions", () => {
    expect(detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(detectImage(Buffer.alloc(0))).toBeNull();
  });
});
