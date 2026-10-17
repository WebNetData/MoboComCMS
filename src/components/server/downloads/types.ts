export type StorageKind = 'local' | 'sftp' | 'ftp'
export type StorageInfo = { id: string; kind: StorageKind; name: string; baseUrl: string; host: string; port: number; username: string; auth: 'password' | 'key'; secure: boolean; root: string; hasSecret: boolean }
export type Job = { id: number; kind: string; label: string; status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'; title: string; url: string; storageId: string; dir: string; name: string; total: number | null; received: number; speed: number; result: string; error: string; createdAt: string; phase: string }
export type Overview = { storages: StorageInfo[]; local: { root: string; baseUrl: string; free: number | null; size: number | null; writable: boolean }; tools: { sevenZip: string; rar: string; unrar: string }; jobs: Job[] }
export type Entry = { name: string; path: string; type: 'dir' | 'file' | 'link'; size: number; mtime: string; url: string; archive: 'zip' | '7z' | 'rar' | 'tar' | null }
export type Listing = { storage: string; dir: string; parent: string | null; entries: Entry[] }
export type ArchiveEntry = { path: string; size: number; packed: number | null; dir: boolean; encrypted: boolean }
export type ArchiveListing = { format: 'zip' | '7z' | 'rar' | 'tar'; encrypted: boolean; needsPassword: boolean; entries: ArchiveEntry[]; files: number; unpacked: number; stamp?: string }
export type Tone = { tone: 'ok' | 'error'; text: string } | null

export const KIND_LABEL: Record<StorageKind, string> = { local: 'همین سرور', sftp: 'سرور دانلود (SFTP)', ftp: 'هاست دانلود (FTP)' }
export const STATUS: Record<Job['status'], [string, string]> = { queued: ['در صف', ''], running: ['در حال انجام', 'is-info'], done: ['انجام شد', 'is-ok'], failed: ['ناموفق', 'is-bad'], cancelled: ['لغو شد', 'is-warn'] }
export const PHASE: Record<string, string> = { upload: 'ارسال به فضای مقصد', download: 'دریافت از مبدأ', extract: 'باز کردن', pack: 'فشرده‌سازی' }
export const TEXT_EXT = /\.(txt|nfo|md|json|xml|ya?ml|ini|conf|cfg|csv|log|html?|css|js|srt|vtt|ass|m3u8?|sfv|md5|sha\d*|htaccess|php|sh)$/i

export const EMPTY_STORAGE = { id: '', kind: 'sftp' as StorageKind, name: '', host: '', port: 22, username: '', secret: '', auth: 'password' as 'password' | 'key', secure: false, root: '/', baseUrl: '' }
