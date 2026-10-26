import type { Prisma } from '@prisma/client'
import { hasFormatFields, mergeFormatData } from '@/modules/journal/domain/formats'
import { knownCodes } from '@/modules/vocabulary/server/vocabulary'

/**
 * A post save's format and its facts: a format the POST_FORMAT list knows (or the post already had; a new post: an
 * article), and the facts the form sent merged into those stored. Throws PostFormatError on a malformed fact.
 */
export async function postFormatInput(tx: Pick<Prisma.TransactionClient, 'vocabulary'>, body: Record<string, unknown> | null, current: { format: string; formatData: string } | null) {
  const out: { format?: string; formatData?: string } = {}
  if (!body) return out
  if (body.format !== undefined || !current) {
    const wanted = String(body.format ?? '').trim().toUpperCase()
    out.format = (wanted ? (await knownCodes(tx, 'journal', 'POST_FORMAT', [wanted], current ? [current.format] : []))[0] : undefined) ?? current?.format ?? 'ARTICLE'
  }
  if (hasFormatFields(body)) out.formatData = mergeFormatData(current?.formatData ?? '{}', body)
  return out
}
