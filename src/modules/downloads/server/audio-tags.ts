import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { buildId3, id3v2Size, trailingTagSize, type Mp3Tags } from '@/modules/downloads/domain/filemeta'

/** Rewrite tags only; MPEG audio bytes are streamed unchanged to a new private file. */
export async function rewriteMp3Tags(input: string, output: string, tags: Mp3Tags, cover?: Uint8Array | null) {
  const handle = await fs.open(input, 'r')
  try {
    const { size } = await handle.stat()
    let start = 0
    const head = Buffer.alloc(10)
    for (let i = 0; i < 8 && start < size; i++) {
      head.fill(0)
      const read = await handle.read(head, 0, 10, start)
      const length = read.bytesRead === 10 ? id3v2Size(head) : 0
      if (!length) break
      if (start + length >= size) throw new Error('invalid MP3 tag length')
      start += length
    }
    const tailLength = Math.min(size - start, 4096), tail = Buffer.alloc(tailLength)
    await handle.read(tail, 0, tailLength, size - tailLength)
    const end = size - trailingTagSize(tail)
    if (end <= start) throw new Error('no audio after the tags')
    const audio = Buffer.alloc(3)
    await handle.read(audio, 0, 3, start)
    if (audio[0] !== 0xff || (audio[1] & 0xe0) !== 0xe0 || (audio[1] & 6) === 0 || (audio[2] & 0xf0) === 0xf0) throw new Error('invalid MPEG audio')
    await fs.writeFile(output, buildId3(tags, cover), { flag: 'wx', mode: 0o600 })
    await pipeline(createReadStream(input, { start, end: end - 1 }), createWriteStream(output, { flags: 'a' }))
  } finally { await handle.close() }
}
