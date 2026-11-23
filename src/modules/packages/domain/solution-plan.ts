import type { SolutionApplyReceipt } from './solution-receipt'

export interface SolutionPlan {
  packageId: string; name: string; version: string; token: string; applied: boolean
  modules: { id: string; name: string; enabled: boolean; defaults: Record<string, unknown>; preserved: string[] }[]
  recommendations: string[]
  receipt?: SolutionApplyReceipt
}
