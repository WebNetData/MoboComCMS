import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { coerceValues } from '@/modules/imports/domain/coerce'
import { getImporter } from '@/modules/imports/server/registry'
import { isExistingValue } from '@/modules/imports/domain/field-inputs'
import type { Message } from '@/modules/imports/domain/types'
import { existingFieldChoices, fieldLookup } from '@/modules/imports/server/field-choices'

export type SelectedFields = Record<string, number[]>
/** Only server-owned lookup definitions can resolve references. A stale/deleted choice fails closed. */
export async function resolveFieldInputs(adapter: string, raw: Record<string, unknown>, cache?: Map<string, unknown>, client: Prisma.TransactionClient | typeof db = db) {
  const values = { ...raw }; const selected: SelectedFields = {}; const messages: Message[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!isExistingValue(value)) continue
    try {
      const lookup = fieldLookup(adapter, key)
      const ids = [...new Set(value.existing.map(Number))]
      if (!lookup || !ids.length || ids.length > (lookup.multiple ? 100 : 1) || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('انتخاب موجود نامعتبر است')
      const cacheKey = 'field-input:' + adapter + ':' + key + ':' + ids.join(',')
      let pending = cache?.get(cacheKey) as ReturnType<typeof existingFieldChoices> | undefined
      if (!pending) { pending = existingFieldChoices(adapter, key, '', 1, ids, client); cache?.set(cacheKey, pending) }
      const result = await pending
      if (result.choices.length !== ids.length) throw new Error('مورد انتخاب‌شده حذف یا غیرفعال شده یا متعلق به این بخش نیست؛ دوباره انتخاب کنید')
      const choices = ids.map(id => result.choices.find(choice => choice.id === String(id))!)
      values[key] = lookup.tree ? choices.flatMap(choice => choice.value as string[][]) : lookup.multiple ? choices.map(choice => choice.value) : choices[0].value
      selected[key] = ids
    } catch (error) { delete values[key]; messages.push({ level: 'error', text: key + ': ' + (error instanceof Error ? error.message : 'انتخاب نامعتبر') }) }
  }
  // Existing albums belong to one exact artist; never guess between namesakes.
  if (selected.album?.length && selected.artist?.length) {
    const result = await existingFieldChoices(adapter, 'album', '', 1, selected.album, client)
    if (result.choices[0]?.row.artistId !== selected.artist[0]) messages.push({ level: 'error', text: 'آلبوم انتخاب‌شده متعلق به هنرمند انتخاب‌شده نیست' })
  }
  return { values, selected, messages }
}


/** Owner transactions reject a renamed, moved or disabled selection rather than recreating its old text. */
export async function assertFieldSelections(adapterId: string, raw: Record<string, unknown>, expected: Record<string, unknown>, client: Prisma.TransactionClient, categorySeparator = '>') {
  const refs = Object.fromEntries(Object.entries(raw).filter(([, value]) => isExistingValue(value)))
  if (!Object.keys(refs).length) return
  const adapter = getImporter(adapterId)
  if (!adapter) throw new Error('مقصد معتبر نیست')
  const fresh = await resolveFieldInputs(adapterId, refs, undefined, client)
  if (fresh.messages.length) throw new Error(fresh.messages.map(message => message.text).join('؛ '))
  const typed = coerceValues(adapter.fields, fresh.values, { categorySeparator })
  if (typed.messages.length || Object.keys(refs).some(key => JSON.stringify(typed.values[key]) !== JSON.stringify(expected[key]))) throw new Error('مورد انتخاب‌شده هم‌زمان تغییر کرده است؛ پیش‌نمایش را دوباره بررسی کنید')
}
