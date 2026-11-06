import { AsyncLocalStorage } from 'node:async_hooks'
import type { AiPurpose } from '../domain/routing'

// Only trusted Admin handlers establish this context; public callers cannot select it with request input.
const context = new AsyncLocalStorage<{ userId: number; purpose?: AiPurpose }>()
export const personalAiActor = () => context.getStore()?.userId
export const personalAiPurpose = () => context.getStore()?.purpose
export const withPersonalAi = <T>(userId: number, work: () => Promise<T>, purpose?: AiPurpose) => context.run({ userId, purpose }, work)
