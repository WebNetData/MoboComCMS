import type { SolutionApplyReceipt } from './solution-receipt'
import type { SolutionNavigationItem } from './solution-composition'

export interface SolutionCompositionPlan {
  theme?: { id: string; name: string; action: 'set' | 'preserve'; current: string }
  navigation?: { action: 'set' | 'preserve'; items: SolutionNavigationItem[] }
  roles?: { template: string; title: string; roleId?: number; action: 'create' | 'preserve' | 'removed'; owned: boolean }[]
  starterContent?: { key: string; slug: string; title: string; pageId?: number; action: 'create' | 'preserve' | 'removed'; owned: boolean }[]
}

export interface SolutionPlan {
  packageId: string; name: string; version: string; token: string; applied: boolean
  modules: { id: string; name: string; enabled: boolean; defaults: Record<string, unknown>; preserved: string[] }[]
  recommendations: string[]
  composition?: SolutionCompositionPlan
  receipt?: SolutionApplyReceipt
}
