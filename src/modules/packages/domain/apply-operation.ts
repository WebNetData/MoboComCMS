import { PackageError } from './format'

export interface GitApplyPlan {
  head: string
  commit: string
  changed: boolean
  url?: string
}
export interface CodeApplyOperation {
  id: string
  fingerprint: string
  target: string
  mode: 'git' | 'local'
  phase: 'prepared' | 'planned' | 'effect' | 'applied' | 'cancelled'
  startedAt: string
  /** No credentials, webhook URLs or private file contents in this receipt. */
  git?: GitApplyPlan
  local?: { before: string | null }
  deploy?: 'claimed' | 'accepted' | 'failed' | 'unknown'
  intent?: 'cancel'
}

export function isCodeApplyOperation(value: unknown): value is CodeApplyOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const op = value as CodeApplyOperation
  const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
  const sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{40,64}$/.test(v)
  if (typeof op.id !== 'string' || !/^[a-f0-9-]{36}$/.test(op.id) || !hash(op.fingerprint) || !hash(op.target)
    || !['git', 'local'].includes(op.mode) || !['prepared', 'planned', 'effect', 'applied', 'cancelled'].includes(op.phase)
    || typeof op.startedAt !== 'string' || !Number.isFinite(Date.parse(op.startedAt))
    || op.intent !== undefined && op.intent !== 'cancel'
    || op.deploy !== undefined && !['claimed', 'accepted', 'failed', 'unknown'].includes(op.deploy)) return false
  if (op.git && (!sha(op.git.head) || !sha(op.git.commit) || typeof op.git.changed !== 'boolean'
    || op.git.url !== undefined && (typeof op.git.url !== 'string' || op.git.url.length > 500))) return false
  if (op.local && op.local.before !== null && !hash(op.local.before)) return false
  if (op.mode === 'git' ? op.local !== undefined : op.git !== undefined || op.deploy !== undefined) return false
  return op.phase === 'prepared' || op.phase === 'cancelled' || (op.mode === 'git' ? !!op.git : !!op.local)
}

export function assertPackageIdle(pkg: { codeApply?: CodeApplyOperation }) {
  if (pkg.codeApply && pkg.codeApply.phase !== 'applied' && pkg.codeApply.phase !== 'cancelled') {
    throw new PackageError('اعمال قبلی بسته ناتمام است؛ ابتدا همان عملیات را ادامه دهید. فایل‌ها و سوابق حفظ شده‌اند')
  }
}
