/** A tab-local, short-lived draft, never authority or an executable command. */
export type AiWorkspaceKind = 'operations' | 'builder' | 'engineering'
export type AiWorkspaceBrief = { actor: string; kind: AiWorkspaceKind; instruction: string; source: string; expires: number }
export const AI_WORKSPACE_EVENT = 'mobocom:ai-workspace'
export const workspaceKey = (actor: string, kind: AiWorkspaceKind) => `mobocom.ai.brief:${actor}:${kind}`
export function workspacePath(value: unknown) {
  return typeof value === 'string' && /^\/(?!\/)[\p{L}\p{N}/_.%-]*$/u.test(value) && value.length <= 240 ? value : ''
}
export function workspaceBrief(value: unknown, actor: string, kind: AiWorkspaceKind, now = Date.now()): AiWorkspaceBrief | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<AiWorkspaceBrief>
  if (!actor || v.actor !== actor || v.kind !== kind || typeof v.instruction !== 'string' || v.instruction.length > 2600 || !v.instruction.trim() || !workspacePath(v.source) || typeof v.expires !== 'number' || !Number.isFinite(v.expires) || v.expires <= now || v.expires > now + 10 * 60_000) return null
  return v as AiWorkspaceBrief
}
export function workspaceInstruction(instruction: string, source: string) {
  const path = workspacePath(source)
  return `${instruction.slice(0, path ? 3700 : 4000)}${path ? `\n\nبخش موردنظر من در موبوکام: ${path}` : ''}`
}
