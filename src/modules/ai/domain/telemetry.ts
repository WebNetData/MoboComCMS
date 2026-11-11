import { AI_PURPOSES } from './routing'

/**
 * `inputTokens` is every input token of the request. The part the service read from its own prompt cache
 * (`cachedInputTokens`) and, for Claude, the part written to it (`cacheWriteTokens`) are within it and are given
 * only when the service reported them.
 */
export type AiUsage = { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; cachedInputTokens?: number; cacheWriteTokens?: number }
export type AiTelemetryPurpose = typeof AI_PURPOSES[number]['id'] | 'general'
export const invocationPurpose = (value: unknown): AiTelemetryPurpose => AI_PURPOSES.some(p => p.id === value) ? value as AiTelemetryPurpose : 'general'
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000 ? value : null

/** Preserve missing provider facts as unknown; never estimate usage from text length. */
export function providerUsage(value: unknown, protocol: 'compatible' | 'anthropic' = 'compatible'): AiUsage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const v = value as Record<string, unknown>
  const details = v.prompt_tokens_details && typeof v.prompt_tokens_details === 'object' ? v.prompt_tokens_details as Record<string, unknown> : {}
  // Claude counts the cache's read and written tokens apart from input_tokens; the OpenAI-style services (OpenAI,
  // Gemini, Qwen, OpenRouter: prompt_tokens_details.cached_tokens; DeepSeek: prompt_cache_hit_tokens) within it.
  const cached = count(protocol === 'anthropic' ? v.cache_read_input_tokens : details.cached_tokens ?? v.prompt_cache_hit_tokens)
  const written = protocol === 'anthropic' ? count(v.cache_creation_input_tokens) : null
  const base = count(protocol === 'anthropic' ? v.input_tokens : v.prompt_tokens ?? v.input_tokens)
  const inputTokens = base === null ? null : protocol === 'anthropic' ? base + (cached || 0) + (written || 0) : base
  const outputTokens = count(protocol === 'anthropic' ? v.output_tokens : v.completion_tokens ?? v.output_tokens)
  const reported = count(v.total_tokens)
  const totalTokens = reported ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null)
  if (inputTokens === null && outputTokens === null && totalTokens === null) return undefined
  const within = (n: number | null) => n !== null && (inputTokens === null || n <= inputTokens) ? n : null
  const cachedIn = within(cached), writtenIn = within(written)
  return { inputTokens, outputTokens, totalTokens, ...(cachedIn ? { cachedInputTokens: cachedIn } : {}), ...(writtenIn ? { cacheWriteTokens: writtenIn } : {}) }
}

export const AI_OUTCOMES = ['grounded', 'clarify', 'source_changed', 'format_invalid', 'superseded'] as const
export type AiOutcome = typeof AI_OUTCOMES[number]
export const monitoringDays = (value: unknown) => [1, 7, 30].includes(Number(value)) ? Number(value) : 7
