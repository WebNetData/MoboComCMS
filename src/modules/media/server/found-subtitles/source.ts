import { db } from '@/platform/database/prisma'
import { downloadGuardEnabled, getDownloadSettings, signOriginUrl } from '@/modules/downloads/server/guard'
import { libraryFile } from '@/modules/media/server/subtitle-files'

/**
 * Where a video file can be read from by the server: a file in Library storage (its /files/… address or
 * the download host address of this server's own folder), or a remote download server. A remote address
 * is signed the way the download protection signs it for viewers, file by file, because a signature is
 * only good for the path it was made for.
 */
export type VideoSource =
  | { kind: 'local'; url: string; file: string }
  | { kind: 'remote'; url: string; sign: (url: string) => string }

async function localBaseUrl(): Promise<string> {
  const row = await db.setting.findUnique({ where: { key: 'server-panel.downloads.v1' } }).catch(() => null)
  try { return String(JSON.parse(row?.value || '{}').localBaseUrl || '').replace(/\/+$/, '') } catch { return '' }
}

/** The /files/… address of a link that points at this server's own download folder, or ''. */
export async function libraryAddress(url: string): Promise<string> {
  if (url.startsWith('/files/')) return url
  const base = await localBaseUrl()
  return base && url.startsWith(`${base}/`) ? `/files/${url.slice(base.length + 1)}` : ''
}

export async function videoSource(url: string): Promise<VideoSource | null> {
  const local = await libraryAddress(url)
  if (local) {
    const file = await libraryFile(local).catch(() => '')
    return file ? { kind: 'local', url: local, file } : null
  }
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const settings = await downloadGuardEnabled() ? await getDownloadSettings() : null
  // The server asks for itself; a host whose signature includes the viewer's address cannot be read this way.
  return { kind: 'remote', url: parsed.toString(), sign: address => settings ? signOriginUrl(address, settings, new Headers()) : address }
}
