import { db } from '@/platform/database/prisma'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import type { CinemaMetadataConfig } from '@/modules/cinema/domain/metadata'

const KEY = 'cinema.metadata.secret.v1'
type Stored = { enabled?: boolean; provider?: 'imdb'|'tmdb'; copyImages?: boolean; cinemetaFallback?: boolean; peoplePhotos?: boolean; tmdbToken?: string; omdbKey?: string }
function parse(value?: string): Stored { return value ? JSON.parse(value) : {} }
export async function metadataCredentials() {
  const row = await db.setting.findUnique({ where: { key: KEY } })
  const saved = parse(row?.value)
  const tmdbToken=saved.tmdbToken ? decryptPanelCredential(saved.tmdbToken) : process.env.TMDB_READ_ACCESS_TOKEN || ''
  return { enabled: saved.enabled !== false, provider: saved.provider || (tmdbToken ? 'tmdb' : 'imdb'), copyImages: saved.copyImages !== false, cinemetaFallback: saved.cinemetaFallback !== false, peoplePhotos: saved.peoplePhotos !== false, tmdbToken, omdbKey: saved.omdbKey ? decryptPanelCredential(saved.omdbKey) : process.env.OMDB_API_KEY || '' }
}
export async function metadataConfig(): Promise<CinemaMetadataConfig> {
  const credentials = await metadataCredentials()
  return { enabled: credentials.enabled, provider: credentials.provider, copyImages: credentials.copyImages, cinemetaFallback: credentials.cinemetaFallback, peoplePhotos: credentials.peoplePhotos, tmdbConfigured: !!credentials.tmdbToken, omdbConfigured: !!credentials.omdbKey, canSaveSecrets: /^[a-f\d]{64}$/i.test(process.env.PANEL_CREDENTIAL_KEY || '') }
}
export async function saveMetadataConfig(input: Record<string, unknown>) {
  const tokens = ['tmdbToken','omdbKey'] as const
  if (input.provider !== undefined && !['imdb','tmdb'].includes(String(input.provider))) throw new Error('منبع اطلاعات معتبر نیست')
  if (tokens.some(key => String(input[key] || '').trim()) && !/^[a-f\d]{64}$/i.test(process.env.PANEL_CREDENTIAL_KEY || '')) throw new Error('ابتدا PANEL_CREDENTIAL_KEY را برای ذخیرهٔ رمزگذاری‌شده تنظیم کنید؛ متغیر محیطی هم پشتیبانی می‌شود')
  for (const key of tokens) if (input[key] && (!/^[A-Za-z0-9._-]+$/.test(String(input[key])) || String(input[key]).length > 2000)) throw new Error('کلید سرویس معتبر نیست')
  for (let attempt=0; attempt<5; attempt++) {
    const row=await db.setting.findUnique({where:{key:KEY}}), next=parse(row?.value)
    if (typeof input.enabled === 'boolean') next.enabled=input.enabled
    if (input.provider === 'imdb' || input.provider === 'tmdb') next.provider=input.provider
    if (typeof input.copyImages === 'boolean') next.copyImages=input.copyImages
    if (typeof input.cinemetaFallback === 'boolean') next.cinemetaFallback=input.cinemetaFallback
    if (typeof input.peoplePhotos === 'boolean') next.peoplePhotos=input.peoplePhotos
    for (const key of tokens) {
      if (input[`clear_${key}`] === true) delete next[key]
      else if (String(input[key] || '').trim()) next[key]=encryptPanelCredential(String(input[key]).trim())
    }
    const value=JSON.stringify(next)
    if (row) { if (!(await db.setting.updateMany({where:{key:KEY,value:row.value},data:{value}})).count) continue }
    else { try { await db.setting.create({data:{key:KEY,value}}) } catch(error) { if ((error as {code?:string}).code==='P2002') continue; throw error } }
    return metadataConfig()
  }
  throw new Error('تنظیمات هم‌زمان تغییر کرد؛ دوباره ذخیره کنید')
}
