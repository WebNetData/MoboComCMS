import { searchTokens, normalizePersian } from '@/shared/text/persian'
import { parsePlatformBotReply, PLATFORM_SUPPORT_NOTICE } from './livechat'
import type { AiOutcome } from '@/modules/ai/domain/telemetry'

export { SUPPORT_SOURCE_TYPES, DEFAULT_KNOWLEDGE, normalizeKnowledge } from './knowledge-config'
export type { KnowledgeSettings, SupportSourceType } from './knowledge-config'
import type { SupportSourceType } from './knowledge-config'
export type SupportSource = { id: number; title: string; href: string; text: string; ref?: { type: SupportSourceType; id: number }; updatedAt?: string }
export const supportPath = (value: string) => /^\/(?!\/|api(?:\/|$)|admin(?:\/|$))[^\s\\?#]{0,279}$/.test(value) && !value.split('/').includes('..') ? value : ''
const plain = (text: string, max: number) => text.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** Relevant administrator facts only; no extra inference or separate search index. */
export function policyPassages(knowledge: string, query: string): string[] {
  const tokens = searchTokens(query).slice(0, 12)
  if (!tokens.length) return []
  return knowledge.slice(0, 12000).split(/\n\s*\n/).flatMap(p => p.match(/[\s\S]{1,900}/g) || [])
    .map((text, index) => ({ text: plain(text, 900), index, score: tokens.reduce((sum, token) => sum + (normalizePersian(text).includes(token) ? token.length : 0), 0) }))
    .filter(p => p.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).map(p => p.text)
}

export const GROUNDING_CLARIFY = 'برای پاسخ دقیق، منبع کافی ندارم. نام محصول یا شمارهٔ سفارش خودتان را مشخص کنید؛ برای بررسی همکار هم می‌توانید در /dashboard/tickets تیکت ثبت کنید.'

/** Citation URLs are appended by the server, not invented by the model. */
export function groundedReply(text: string, sources: SupportSource[]): { body: string; handoff: boolean; outcome: AiOutcome } {
  if (text.includes('[OUT_OF_SCOPE]')) return { body: PLATFORM_SUPPORT_NOTICE, handoff: false, outcome: 'clarify' }
  if (!text.trimStart().startsWith('[MOBOCOM]')) return { body: GROUNDING_CLARIFY, handoff: true, outcome: 'format_invalid' }
  const ids = [...new Set([...text.matchAll(/\[S(\d+)\]/g)].map(m => Number(m[1])))], selected = ids.map(id => sources.find(s => s.id === id))
  if (!ids.length || ids.length > 3 || selected.some(s => !s)) return { body: GROUNDING_CLARIFY, handoff: true, outcome: ids.length ? 'format_invalid' : 'clarify' }
  const reply = parsePlatformBotReply(text.replace(/\[S\d+\]/g, ''))
  const references = selected.map(s => `${plain(s!.title, 40)}${s!.href ? ` — ${supportPath(s!.href)}` : ''}`).join('\n')
  return { body: `${reply.body.slice(0, 950)}\n\nمنابع:\n${references}`.slice(0, 2000), handoff: reply.handoff, outcome: reply.handoff ? 'clarify' : 'grounded' }
}
