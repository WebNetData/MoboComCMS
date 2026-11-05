import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import os from 'node:os'
import { db } from '@/platform/database/prisma'
import { normalizeMusicSettings } from '@/modules/music/domain/music'
import { musicFileMetadata, musicFileName, type MusicFileMetadata } from '@/modules/music/domain/file-policy'
import { rewriteMp3Tags } from '@/modules/downloads/server/audio-tags'

/** Reads uncached settings at execution time, so disabling affects queued work too. */
export async function musicTransferPolicy() {
  const row = await db.setting.findUnique({ where: { key: 'music.portal.v1' } })
  const settings = normalizeMusicSettings(row ? JSON.parse(row.value) : {})
  return { rename: settings.renameTransferredFiles, tag: settings.tagTransferredFiles, brand: settings.fileTagBrand, url: settings.fileTagUrl }
}
export async function captureMusicMetadata(raw: unknown) {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const id = Number(r.artistId)
  const artist = Number.isSafeInteger(id) && id > 0 ? await db.musicArtist.findUnique({ where: { id }, select: { name: true, nameEn: true } }) : null
  return musicFileMetadata({ artist: artist?.nameEn || artist?.name || r.artistEn || r.artist, title: r.titleEn || r.title, album: r.album, quality: r.quality })
}
export async function prepareMusicTransfer(source: string, raw: unknown) {
  const metadata = musicFileMetadata(raw), policy = await musicTransferPolicy()
  const name = musicFileName(source, metadata, policy.rename)
  return { name, prepare: policy.tag && /\.(mp3|m4a|flac|ogg|opus|wav)$/i.test(source) ? (file: string) => tagFile(file, source, metadata, policy) : undefined }
}
async function tagFile(file: string, source: string, metadata: MusicFileMetadata, policy: Awaited<ReturnType<typeof musicTransferPolicy>>) {
  const ext = /\.([a-z0-9]+)$/i.exec(source)![1].toLowerCase(), output = `${file}.tagged.${ext}`
  const tags = { title: metadata.title, artist: metadata.artist, album: metadata.album, comment: `${policy.brand} | ${policy.url}`, url: policy.url }
  try {
    if (ext === 'mp3') await rewriteMp3Tags(file, output, tags)
    else await new Promise<void>((resolve, reject) => {
      const args = ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,mp3,flac,ogg,wav', '-max_alloc', '67108864', '-i', file, '-map', '0:a', '-c', 'copy', '-map_metadata', '-1', '-map_chapters', '-1']
      for (const [key, value] of Object.entries(tags)) if (value) args.push('-metadata', `${key}=${value}`)
      args.push('-n', output)
      const child = spawn('ffmpeg', args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'], env: { NODE_ENV: process.env.NODE_ENV || 'production', PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '', TEMP: os.tmpdir(), TMP: os.tmpdir(), LANG: 'C.UTF-8', AV_LOG_FORCE_NOCOLOR: '1' } })
      const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
      child.once('error', () => { clearTimeout(timer); reject(new Error('ابزار ffmpeg برای تگ‌گذاری این فرمت در دسترس نیست')) })
      child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('تگ‌گذاری فایل صوتی انجام نشد')) })
    })
    await fs.rename(output, file)
  } finally { await fs.rm(output, { force: true }) }
}
