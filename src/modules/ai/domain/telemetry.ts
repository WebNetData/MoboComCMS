import { AI_PURPOSES } from './routing'

export type AiUsage = { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null }
export type AiTelemetryPurpose = typeof AI_PURPOSES[number]['id'] | 'general'
export const invocationPurpose = (value: unknown): AiTelemetryPurpose => AI_PURPOSES.some(p => p.id === value) ? value as AiTelemetryPurpose : 'general'
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000 ? value : null

/** Preserve missing provider facts as unknown; never estimate usage from text length. */
export function providerUsage(value: unknown, protocol: 'compatible' | 'anthropic' = 'compatible'): AiUsage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const v = value as Record<string, unknown>
  const inputTokens = count(protocol === 'anthropic' ? v.input_tokens : v.prompt_tokens ?? v.input_tokens)
  const outputTokens = count(protocol === 'anthropic' ? v.output_tokens : v.completion_tokens ?? v.output_tokens)
  const reported = count(v.total_tokens)
  const totalTokens = reported ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null)
  return inputTokens === null && outputTokens === null && totalTokens === null ? undefined : { inputTokens, outputTokens, totalTokens }
}

export const AI_OUTCOMES = ['grounded', 'clarify', 'source_changed', 'format_invalid', 'superseded'] as const
export type AiOutcome = typeof AI_OUTCOMES[number]
export const monitoringDays = (value: unknown) => [1, 7, 30].includes(Number(value)) ? Number(value) : 7
