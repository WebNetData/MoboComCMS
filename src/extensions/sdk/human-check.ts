'use client'

/** Shared anti-bot widget for trusted plugin forms; policy and verification remain owned by Identity. */
export { default as HumanCheck, useHumanCheck, humanCheckRefused } from '@/components/HumanCheck'
export type { HumanSurface } from '@/modules/identity/domain/human-check'
