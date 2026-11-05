import sharp from 'sharp'

/** Both networks receive the actual featured image, normalized to their shared JPEG constraints. */
export async function socialImage(image: string, base: string): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const input = await (await import('@/modules/media/server/library')).publicImageBytes(image, base)
    const jpeg = await sharp(input, { limitInputPixels: 50_000_000 }).rotate()
      .resize(1080, 1350, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true }).toBuffer()
    if (jpeg.length > 8 * 1024 ** 2) throw new Error('حجم تصویر آماده‌شده بیش از حد است')
    return new Uint8Array(jpeg)
  } catch {
    throw new Error('تصویر شاخص قابل دریافت یا تبدیل نیست؛ تصویر یا وضعیت انتقال آن را بررسی کنید')
  }
}
