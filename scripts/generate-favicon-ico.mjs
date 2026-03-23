/**
 * Writes public/favicon.ico with an embedded PNG (ICO format supports PNG payload).
 * Run: node scripts/generate-favicon-ico.mjs
 */
import { Buffer } from "node:buffer"
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

// Minimal valid 1x1 PNG (transparent)
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)

if (png[0] !== 0x89 || png.toString("ascii", 1, 4) !== "PNG") {
  throw new Error("Invalid PNG payload")
}

const bytesInRes = png.length
const imageOffset = 22
const buf = Buffer.alloc(imageOffset + bytesInRes)

buf.writeUInt16LE(0, 0)
buf.writeUInt16LE(1, 2)
buf.writeUInt16LE(1, 4)
buf.writeUInt8(1, 6)
buf.writeUInt8(1, 7)
buf.writeUInt8(0, 8)
buf.writeUInt8(0, 9)
buf.writeUInt16LE(1, 10)
// PNG payload in ICO: biBitCount must be 0 per MS ICO format
buf.writeUInt16LE(0, 12)
buf.writeUInt32LE(bytesInRes, 14)
buf.writeUInt32LE(imageOffset, 18)
png.copy(buf, imageOffset)

writeFileSync(join(root, "public", "favicon.ico"), buf)
