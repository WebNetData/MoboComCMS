import type { AiProviderId } from './ai'
export type ProductionTarget = { source: 'chat-web' } | { source: 'api'; provider: AiProviderId; model: string; binding?: string }
export type ProductionGeneration = { text: ProductionTarget; image: ProductionTarget; confirmed: boolean }
export type ProductionChoice = { provider: AiProviderId; label: string; model: string }
export type ProductionStep = { itemId: string; lease: string; phase: 'text'|'image'; index?: number; prompt: string }
export const chatTarget = (): ProductionTarget => ({ source: 'chat-web' })
