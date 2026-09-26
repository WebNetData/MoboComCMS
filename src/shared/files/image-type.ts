// Image uploads are trusted only after checking their magic bytes and structure, never the file name or MIME type.
export function sniffImage(bytes: Buffer): { extension: string; mimeType: string } | null {
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(bytes.length - 12) === 0 && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') return { extension: 'png', mimeType: 'image/png' }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return { extension: 'jpg', mimeType: 'image/jpeg' }
  if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.readUInt32LE(4) === bytes.length - 8 && bytes.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) return { extension: 'webp', mimeType: 'image/webp' }
  return null
}
