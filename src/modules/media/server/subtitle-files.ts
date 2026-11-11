import fs from 'node:fs/promises'
import path from 'node:path'
import { filesRoot, fetchRemoteBytes } from '@/modules/downloads/server/files'

/** The real path of a /files/… address inside Library storage; anything that leaves it is refused. */
export async function libraryFile(url: string): Promise<string> {
  // Validate before URL normalization can discard traversal segments.
  const parts = url.split(/[?#]/, 1)[0].slice('/files/'.length).split('/').map(decodeURIComponent)
  if (!url.startsWith('/files/') || !parts.length || parts.some(part => !part || part.startsWith('.') || /[\\/\u0000-\u001f]/.test(part))) throw Error('Invalid subtitle path')
  const root = await fs.realpath(filesRoot()), file = await fs.realpath(path.join(root, ...parts))
  if (!file.startsWith(root + path.sep)) throw Error('Subtitle outside Library storage')
  return file
}

/** Library subtitles are read locally, without a loopback HTTP/SSRF exception. */
export async function subtitleBytes(url: string, remoteUrl: string, maxBytes: number): Promise<Uint8Array> {
  if (!url.startsWith('/files/')) return fetchRemoteBytes(remoteUrl, maxBytes)
  const handle = await fs.open(await libraryFile(url), 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > maxBytes) throw Error('Subtitle too large')
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of handle.createReadStream({ start: 0, end: maxBytes, autoClose: false })) {
      size += chunk.length
      if (size > maxBytes) throw Error('Subtitle too large')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  } finally { await handle.close() }
}
