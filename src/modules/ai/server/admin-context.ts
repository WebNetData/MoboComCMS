import { AsyncLocalStorage } from 'node:async_hooks'

// Only trusted Admin handlers establish this context; public callers cannot select it with request input.
const context = new AsyncLocalStorage<number>()
export const personalAiActor = () => context.getStore()
export const withPersonalAi = <T>(userId: number, work: () => Promise<T>) => context.run(userId, work)
