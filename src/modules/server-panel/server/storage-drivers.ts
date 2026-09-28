import fs from 'node:fs/promises'
import path from 'node:path'
import { PassThrough, type Readable } from 'node:stream'
import { createReadStream } from 'node:fs'
import SftpClient from 'ssh2-sftp-client'
import { Client as FtpClient } from 'basic-ftp'
import { DownloadError, baseName, joinRel, type Storage } from '@/modules/server-panel/domain/downloads'

// One interface over this server's download folder, SFTP servers and FTP
// download hosts. Paths are storage-relative and already normalized by the
// caller (domain/downloads.ts normalizeRelPath).

export type StoredEntry = { name: string; path: string; type: 'dir' | 'file' | 'link'; size: number; mtime: string }
export type Progress = (bytes: number) => void

export interface Driver {
  list(dir: string): Promise<StoredEntry[]>
  stat(target: string): Promise<StoredEntry | null>
  mkdir(dir: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  remove(target: string, isDir: boolean): Promise<void>
  /** Local file → storage. */
  upload(localFile: string, target: string, progress?: Progress): Promise<void>
  /** Storage → local file. */
  download(target: string, localFile: string, progress?: Progress): Promise<void>
  /** Readable stream of a stored file (for the browser). */
  read(target: string): Promise<Readable>
  close(): Promise<void>
}

const HIDDEN = new Set(['.incoming'])

function osMessage(error: unknown): never {
  const code = (error as NodeJS.ErrnoException)?.code
  const messages: Record<string, [string, number]> = {
    ENOENT: ['فایل یا پوشه پیدا نشد', 404], EACCES: ['اجازهٔ دسترسی به این مسیر نیست', 403], EPERM: ['سیستم‌عامل اجازهٔ این کار را نمی‌دهد', 403],
    EEXIST: ['فایل یا پوشه‌ای با این نام وجود دارد', 409], ENOTEMPTY: ['پوشه خالی نیست', 409], ENOSPC: ['فضای دیسک پر است', 507],
  }
  const [message, status] = messages[code || ''] || [`عملیات انجام نشد${error instanceof Error && error.message ? `: ${error.message.slice(0, 160)}` : ''}`, 502]
  throw new DownloadError(message, status)
}

// ------------------------------------------------------------------ local

export function localDriver(root: string): Driver {
  const abs = (rel: string) => path.join(root, rel)
  const entry = async (rel: string): Promise<StoredEntry | null> => {
    const info = await fs.lstat(abs(rel)).catch(() => null)
    if (!info) return null
    let type: StoredEntry['type'] = info.isDirectory() ? 'dir' : info.isSymbolicLink() ? 'link' : 'file'
    if (type === 'link' && (await fs.stat(abs(rel)).catch(() => null))?.isDirectory()) type = 'dir'
    return { name: baseName(rel) || '/', path: rel, type, size: info.size, mtime: info.mtime.toISOString() }
  }
  return {
    async list(dir) {
      const names = await fs.readdir(abs(dir)).catch(osMessage)
      const rows = await Promise.all(names.filter((name) => !(dir === '/' && HIDDEN.has(name))).slice(0, 5000).map((name) => entry(joinRel(dir, name))))
      return rows.filter((row): row is StoredEntry => !!row)
    },
    stat: entry,
    async mkdir(dir) { await fs.mkdir(abs(dir), { recursive: true }).catch(osMessage) },
    async rename(from, to) {
      if (await fs.lstat(abs(to)).then(() => true, () => false)) throw new DownloadError('فایل یا پوشه‌ای با این نام وجود دارد', 409)
      await fs.rename(abs(from), abs(to)).catch(async (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') osMessage(error)
        await fs.cp(abs(from), abs(to), { recursive: true }).catch(osMessage)
        await fs.rm(abs(from), { recursive: true, force: true })
      })
    },
    async remove(target) { await fs.rm(abs(target), { recursive: true }).catch(osMessage) },
    async upload(localFile, target, progress) {
      await fs.mkdir(path.dirname(abs(target)), { recursive: true })
      await fs.rename(localFile, abs(target)).catch(async () => { await fs.copyFile(localFile, abs(target)).catch(osMessage); await fs.rm(localFile, { force: true }) })
      progress?.((await fs.stat(abs(target))).size)
    },
    async download(target, localFile, progress) {
      await fs.copyFile(abs(target), localFile).catch(osMessage)
      progress?.((await fs.stat(localFile)).size)
    },
    async read(target) { await fs.access(abs(target)).catch(osMessage); return createReadStream(abs(target)) },
    async close() { /* nothing to release */ },
  }
}

// ------------------------------------------------------------------ SFTP

export async function sftpDriver(storage: Storage, secret: string): Promise<Driver> {
  const client = new SftpClient()
  const abs = (rel: string) => path.posix.join(storage.root, rel)
  try {
    await client.connect({
      host: storage.host, port: storage.port, username: storage.username, readyTimeout: 15_000,
      ...(storage.auth === 'key' ? { privateKey: secret } : { password: secret }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    throw new DownloadError(/authentication|auth/i.test(message) ? 'ورود به سرور SFTP پذیرفته نشد (نام کاربری، رمز یا کلید را بررسی کنید)' : `اتصال به ${storage.host} برقرار نشد: ${message.slice(0, 160)}`, 502)
  }
  const fail = (error: unknown): never => {
    const message = error instanceof Error ? error.message : String(error)
    if (/No such file|ENOENT/i.test(message)) throw new DownloadError('فایل یا پوشه پیدا نشد', 404)
    if (/Permission denied|EACCES/i.test(message)) throw new DownloadError('اجازهٔ دسترسی به این مسیر روی سرور دانلود نیست', 403)
    throw new DownloadError(`عملیات روی سرور دانلود انجام نشد: ${message.slice(0, 160)}`, 502)
  }
  const toEntry = (dir: string, item: { type: string; name: string; size: number; modifyTime: number }): StoredEntry => ({
    name: item.name, path: joinRel(dir, item.name), type: item.type === 'd' ? 'dir' : item.type === 'l' ? 'link' : 'file', size: item.size, mtime: new Date(item.modifyTime).toISOString(),
  })
  return {
    async list(dir) { return (await client.list(abs(dir)).catch(fail)).map((item) => toEntry(dir, item)) },
    async stat(target) {
      const info = await client.stat(abs(target)).catch(() => null)
      return info ? { name: baseName(target), path: target, type: info.isDirectory ? 'dir' : 'file', size: info.size, mtime: new Date(info.modifyTime).toISOString() } : null
    },
    async mkdir(dir) { await client.mkdir(abs(dir), true).catch(fail) },
    async rename(from, to) {
      if (await client.exists(abs(to))) throw new DownloadError('فایل یا پوشه‌ای با این نام وجود دارد', 409)
      await client.rename(abs(from), abs(to)).catch(fail)
    },
    async remove(target, isDir) { if (isDir) await client.rmdir(abs(target), true).catch(fail); else await client.delete(abs(target)).catch(fail) },
    async upload(localFile, target, progress) {
      await client.mkdir(path.posix.dirname(abs(target)), true).catch(() => undefined)
      await client.fastPut(localFile, abs(target), { step: (done: number) => progress?.(done) }).catch(fail)
    },
    async download(target, localFile, progress) { await client.fastGet(abs(target), localFile, { step: (done: number) => progress?.(done) }).catch(fail) },
    async read(target) {
      const stream = client.createReadStream(abs(target))
      stream.on('close', () => void client.end().catch(() => undefined))
      return stream
    },
    async close() { await client.end().catch(() => undefined) },
  }
}

// ------------------------------------------------------------------ FTP / FTPS

export async function ftpDriver(storage: Storage, secret: string): Promise<Driver> {
  const client = new FtpClient(30_000)
  const abs = (rel: string) => path.posix.join(storage.root, rel)
  try {
    await client.access({ host: storage.host, port: storage.port, user: storage.username, password: secret, secure: storage.secure })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    throw new DownloadError(/530|login|auth/i.test(message) ? 'ورود به هاست FTP پذیرفته نشد (نام کاربری یا رمز)' : `اتصال به ${storage.host} برقرار نشد: ${message.slice(0, 160)}`, 502)
  }
  const fail = (error: unknown): never => {
    const message = error instanceof Error ? error.message : String(error)
    if (/550/.test(message)) throw new DownloadError('فایل یا پوشه پیدا نشد یا اجازهٔ دسترسی نیست', 404)
    throw new DownloadError(`عملیات روی هاست دانلود انجام نشد: ${message.slice(0, 160)}`, 502)
  }
  const track = (progress?: Progress) => client.trackProgress((info) => progress?.(info.bytes))
  // basic-ftp runs one command at a time; queue calls so parallel requests never interleave.
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>) => { const next = chain.then(fn, fn); chain = next.catch(() => undefined); return next }
  return {
    list: (dir) => serial(async () => (await client.list(abs(dir)).catch(fail)).filter((item) => item.name !== '.' && item.name !== '..').map((item) => ({
      name: item.name, path: joinRel(dir, item.name), type: item.isDirectory ? 'dir' : item.isSymbolicLink ? 'link' : 'file', size: item.size, mtime: (item.modifiedAt || new Date(0)).toISOString(),
    }))),
    stat: (target) => serial(async () => {
      const size = await client.size(abs(target)).catch(() => null)
      return size === null ? null : { name: baseName(target), path: target, type: 'file' as const, size, mtime: new Date(0).toISOString() }
    }),
    mkdir: (dir) => serial(async () => { await client.ensureDir(abs(dir)).catch(fail); await client.cd('/').catch(() => undefined) }),
    rename: (from, to) => serial(async () => { await client.rename(abs(from), abs(to)).catch(fail) }),
    remove: (target, isDir) => serial(async () => { if (isDir) await client.removeDir(abs(target)).catch(fail); else await client.remove(abs(target)).catch(fail) }),
    upload: (localFile, target, progress) => serial(async () => {
      await client.ensureDir(path.posix.dirname(abs(target))).catch(fail)
      await client.cd('/').catch(() => undefined)
      track(progress)
      try { await client.uploadFrom(localFile, abs(target)).catch(fail) } finally { client.trackProgress() }
    }),
    download: (target, localFile, progress) => serial(async () => {
      track(progress)
      try { await client.downloadTo(localFile, abs(target)).catch(fail) } finally { client.trackProgress() }
    }),
    read: (target) => serial(async () => {
      const stream = new PassThrough()
      void client.downloadTo(stream, abs(target)).catch((error) => stream.destroy(error)).finally(() => client.close())
      return stream
    }),
    close: async () => { await chain.catch(() => undefined); client.close() },
  }
}
