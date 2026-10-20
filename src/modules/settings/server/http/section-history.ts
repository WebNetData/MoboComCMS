import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { RevisionError } from '@/modules/content/server/revisions'
import { JsonSettingMutationError, sectionSettingsRevision, type SectionSettingsContext } from '@/modules/settings/server'

export function sectionSettingsAnswer<T extends object>(settings: T, extra: object = {}) {
  const response = ok({ ...extra, settings, settingsRevision: sectionSettingsRevision(settings) })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export async function sectionSettingsRead<T extends object>(work: () => Promise<{ settings: T; [key: string]: unknown }>) {
  try { const { settings, ...extra } = await work(); return sectionSettingsAnswer(settings, extra) }
  catch (error) { if (error instanceof RevisionError) return err(error.message, error.status); throw error }
}
export async function sectionSettingsWrite<T extends object>(req: NextRequest, actor: SectionSettingsContext['actor'], save: (input: unknown, context: SectionSettingsContext) => Promise<T>) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  try {
    const input = await readJsonObject(req, 120_000)
    return sectionSettingsAnswer(await save(input, { req, actor, expected: req.headers.get('if-match') }))
  } catch (error) {
    if (error instanceof RevisionError) return err(error.message, error.status)
    if (error instanceof JsonSettingMutationError || ['P2034', 'P2002'].includes(String((error as { code?: string }).code))) return err('تنظیمات هم‌زمان تغییر کرده یا نیاز به بررسی دارد؛ دوباره بررسی کنید', 409)
    if (error instanceof JsonBodyError) return err(error.message, error.status)
    console.error('[settings.section]', error)
    return err('تنظیمات ذخیره نشد؛ دوباره تلاش کنید', 500)
  }
}

/**
 * For an owner whose route already has its own body and answer: same Origin, If-Match and error rules as
 * `sectionSettingsWrite`, while the existing client shape stays (plus `settingsRevision`).
 */
export async function sectionSettingsSaveWith<T extends object>(req: NextRequest, actor: SectionSettingsContext['actor'], save: (context: SectionSettingsContext) => Promise<T>, answer: (settings: T) => Record<string, unknown> | Promise<Record<string, unknown>>) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  try {
    const settings = await save({ req, actor, expected: req.headers.get('if-match') })
    const response = ok({ ...await answer(settings), settingsRevision: sectionSettingsRevision(settings) })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof RevisionError) return err(error.message, error.status)
    if (error instanceof JsonSettingMutationError || ['P2034', 'P2002'].includes(String((error as { code?: string }).code))) return err('تنظیمات هم‌زمان تغییر کرده یا نیاز به بررسی دارد؛ صفحه را تازه کنید. تغییرات شما در فرم مانده است', 409)
    console.error('[settings.section]', error)
    return err('تنظیمات ذخیره نشد؛ دوباره تلاش کنید', 500)
  }
}
