/** Public server address for other modules; provider and credential implementations remain private. */
export { generate, getAiConfig, publicAiReady, AiError } from './client'
export type { Prompt, AiConfig } from '../domain/ai'
export type { AiPurpose } from '../domain/routing'
