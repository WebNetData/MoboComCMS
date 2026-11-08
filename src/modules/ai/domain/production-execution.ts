import type { AiProviderId } from './ai'
export const CHAT_WEB_PROVIDERS = ['chatgpt','gemini','qwen','deepseek'] as const
export type ChatWebProvider = typeof CHAT_WEB_PROVIDERS[number]
export type ProductionTarget = { source: 'chat-web'; chatProvider?: ChatWebProvider } | { source: 'api'; provider: AiProviderId; model: string; binding?: string }
export type ProductionGeneration = { text: ProductionTarget; image: ProductionTarget; confirmed: boolean }
export type ProductionChoice = { provider: AiProviderId; label: string; model: string }
export type ProductionStep = { itemId: string; lease: string; phase: 'text'|'image'; index?: number; prompt: string }
export const chatTarget = (): ProductionTarget => ({ source: 'chat-web' })
