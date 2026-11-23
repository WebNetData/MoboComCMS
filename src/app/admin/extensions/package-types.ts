import type { SolutionPack } from '@/modules/packages/domain/solution-pack'
import type { SolutionApplyReceipt } from '@/modules/packages/domain/solution-receipt'
type Setting = { key: string; label: string; labelEn?: string; type: 'text' | 'textarea'; default?: string }
type Manifest = {
  id: string; name: string; nameEn?: string; description?: string; descriptionEn?: string; version: string; author?: string
  kind: 'plugin' | 'theme'; runtime: 'declarative' | 'code'; slots?: Record<string, unknown>; pages?: { slug: string; title: { fa: string; en: string } }[]; settings?: Setting[]
  solutionPack?: SolutionPack
}
export type PackageRow = {
  id: string; manifest: Manifest; uninstalledAt?: string; enabled: boolean; settings: Record<string, string>; files: { path: string; bytes: number; editable: boolean }[]
  bytes: number; updatedAt: string; revisions: number; codeStatus?: 'staged' | 'applied'; active?: boolean
  solutionApply?: SolutionApplyReceipt
  codeApply?: { id: string; mode: 'git' | 'local'; phase: 'prepared' | 'planned' | 'effect' | 'applied' | 'cancelled'; intent?: 'cancel'; deploy?: 'claimed' | 'accepted' | 'failed' | 'unknown' } | null
}
