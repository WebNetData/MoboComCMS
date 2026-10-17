import { db } from '@/platform/database/prisma'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import type { CinemaMetadataConfig } from '@/modules/cinema/domain/metadata'

const KEY = 'cinema.metadata.secret.v1'
type Stored = { enabled?: boolean; tmdbToken?: string; omdbKey?: string }
function parse(value?: string): Stored { return value ? JSON.parse(value) : {} }
export async function metadataCredentials() {
  const row = await db.setting.findUnique({ where: { key: KEY } })
  const saved = parse(row?.value)
  return { enabled: saved.enabled !== false, tmdbToken: saved.tmdbToken ? decryptPanelCredential(saved.tmdbToken) : process.env.TMDB_READ_ACCESS_TOKEN || '', omdbKey: saved.omdbKey ? decryptPanelCredential(saved.omdbKey) : process.env.OMDB_API_KEY || '' }
}
export async function metadataConfig(): Promise<CinemaMetadataConfig> {
  const credentials = await metadataCredentials()
  return { enabled: credentials.enabled, tmdbConfigured: !!credentials.tmdbToken, omdbConfigured: !!credentials.omdbKey, canSaveSecrets: /^[a-f\d]{64}$/i.test(process.env.PANEL_CREDENTIAL_KEY || '') }
}
export async function saveMetadataConfig(input: Record<string, unknown>) {
  const tokens = ['tmdbToken','omdbKey'] as const
  if (tokens.some(key => String(input[key] || '').trim()) && !/^[a-f\d]{64}$/i.test(process.env.PANEL_CREDENTIAL_KEY || '')) throw new Error('ابتدا PANEL_CREDENTIAL_KEY را برای ذخیرهٔ رمزگذاری‌شده تنظیم کنید؛ متغیر محیطی هم پشتیبانی می‌شود')
  for (const key of tokens) if (input[key] && (!/^[A-Za-z0-9._-]+$/.test(String(input[key])) || String(input[key]).length > 2000)) throw new Error('کلید سرویس معتبر نیست')
  for (let attempt=0; attempt<5; attempt++) {
    const row=await db.setting.findUnique({where:{key:KEY}}), next=parse(row?.value)
    if (typeof input.enabled === 'boolean') next.enabled=input.enabled
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
