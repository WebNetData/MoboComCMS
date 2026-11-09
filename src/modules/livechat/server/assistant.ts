import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { isModuleEnabled } from '@/extensions/server/modules'
import { getSettings } from '@/modules/settings/server'
import { generate } from '@/modules/ai/server/generation'
import { resolveCurrentUser } from '@/modules/identity/server/access'
import { chatPrompt, parsePlatformBotReply, platformSupportRefusal, type ChatSettings } from '../domain/livechat'
import { groundedReply, GROUNDING_CLARIFY } from '../domain/knowledge'
import type { AiOutcome } from '@/modules/ai/domain/telemetry'
import { supportSources, sourcesStillPublic } from './knowledge'
import { customerFacts } from './customer-facts'
import { getChatSettings } from './settings'

export async function answerSupport(conversation: { id: number; userId: number | null }, settings: ChatSettings): Promise<{ body: string; handoff: boolean; outcome: AiOutcome; observationId?: string } | null> {
  try {
    if (!await isModuleEnabled('ai-assistant')) return null
    const authAt = Date.now()
    if (conversation.userId && !await resolveCurrentUser(conversation.userId, authAt)) return null
    const turns = await db.chatMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { id: 'desc' }, take: 16, select: { sender: true, body: true } })
    const query = turns.find(turn => turn.sender === 'VISITOR')?.body || ''
    const refusal = platformSupportRefusal(query)
    if (refusal) return { body: refusal, handoff: false, outcome: 'clarify' }
    const [site, customer, sources] = await Promise.all([getSettings(), customerFacts(conversation.userId), settings.grounding.enabled ? supportSources(query, settings.knowledge, settings.grounding) : undefined])
    if (customer && sources) sources.push({ id: sources.length + 1, title: 'اطلاعات حساب خودتان', href: '/dashboard/orders', text: customer.slice(0, 2400) })
    const prompt = chatPrompt({ brand: site.brandName || 'موبوکام', botName: settings.botName, knowledge: settings.knowledge, customer, sources, turns: turns.reverse().filter(t => t.sender !== 'SYSTEM') })
    const result = await generate(prompt, undefined, 'support')
    // Recheck authoritative facts after the model wait; never replay inference on changes.
    if (conversation.userId && !await resolveCurrentUser(conversation.userId, authAt)) return { body: GROUNDING_CLARIFY, handoff: true, outcome: 'source_changed', observationId: result.observationId }
    const [current, freshCustomer, publicSources] = await Promise.all([getChatSettings(), customerFacts(conversation.userId), sources ? sourcesStillPublic(sources) : true])
    if (!publicSources || freshCustomer !== customer || current.knowledge !== settings.knowledge || JSON.stringify(current.grounding) !== JSON.stringify(settings.grounding)) return { body: GROUNDING_CLARIFY, handoff: true, outcome: 'source_changed', observationId: result.observationId }
    const reply = sources ? groundedReply(result.text, sources) : { ...parsePlatformBotReply(result.text), outcome: 'clarify' as const }
    return reply.body ? { ...reply, observationId: result.observationId } : null
  } catch {
    logEvent('warn', 'livechat.bot_failed', { conversationId: conversation.id, reason: 'provider_or_context_unavailable' })
    return null
  }
}
