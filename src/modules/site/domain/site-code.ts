/**
 * Site-wide custom code: HTML, CSS or JavaScript snippets with display conditions, like analytics tags, chat
 * widgets or global effects. They run only on public pages: Admin, API, sign-in and setup pages never run them,
 * so a broken snippet can always be switched off from Admin. The master switch and `SITE_CODE_DISABLED=1`
 * turn every snippet off at once.
 */
export const SITE_CODE_KINDS = ['html', 'css', 'js'] as const
export const SITE_CODE_LOCATIONS = ['head', 'body-start', 'body-end'] as const
export const SITE_CODE_AUDIENCES = ['all', 'guests', 'members'] as const
export const SITE_CODE_MAX = 30
export const SNIPPET_MAX = 60000
export type SiteCodeKind = typeof SITE_CODE_KINDS[number]
export type SiteCodeLocation = typeof SITE_CODE_LOCATIONS[number]
export type SiteCodeAudience = typeof SITE_CODE_AUDIENCES[number]
export type SiteSnippet = { id: string; name: string; kind: SiteCodeKind; location: SiteCodeLocation; code: string; enabled: boolean; paths: string[]; exclude: string[]; audience: SiteCodeAudience }
export type SiteCodeSettings = { enabled: boolean; snippets: SiteSnippet[] }

/** Never run here, whatever a snippet's conditions say. */
export const PROTECTED_PATHS = ['/admin', '/api', '/login', '/register', '/forgot-password', '/reset-password', '/install', '/builder-preview', '/maintenance'] as const

const pick = <T extends readonly string[]>(value: unknown, list: T, fallback: T[number]): T[number] => (list as readonly unknown[]).includes(value) ? value as T[number] : fallback
const PATH = /^\/[\p{L}\p{N}/_.~%*-]{0,200}$/u
const paths = (value: unknown) => [...new Set((Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,]+/) : [])
  .map(p => typeof p === 'string' ? p.trim() : '').filter(p => PATH.test(p)))].slice(0, 20)

export function normalizeSiteCode(input: unknown): SiteCodeSettings {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const ids = new Set<string>()
  const snippets = (Array.isArray(raw.snippets) ? raw.snippets : []).flatMap((entry): SiteSnippet[] => {
    if (!entry || typeof entry !== 'object') return []
    const s = entry as Record<string, unknown>
    const id = typeof s.id === 'string' && /^sc-[a-z0-9]{4,16}$/.test(s.id) && !ids.has(s.id) ? s.id : ''
    if (!id) return []
    ids.add(id)
    const kind = pick(s.kind, SITE_CODE_KINDS, 'html')
    const location = kind === 'html' || kind === 'js' ? pick(s.location, SITE_CODE_LOCATIONS, 'body-end') : 'head'
    return [{ id, name: typeof s.name === 'string' ? s.name.trim().slice(0, 80) : '', kind, location, code: typeof s.code === 'string' ? s.code.slice(0, SNIPPET_MAX) : '', enabled: s.enabled === true, paths: paths(s.paths), exclude: paths(s.exclude), audience: pick(s.audience, SITE_CODE_AUDIENCES, 'all') }]
  }).slice(0, SITE_CODE_MAX)
  return { enabled: raw.enabled === true, snippets }
}

const under = (path: string, prefix: string) => {
  if (prefix.endsWith('*')) return path.startsWith(prefix.slice(0, -1))
  const base = prefix.length > 1 ? prefix.replace(/\/$/, '') : prefix
  return base === '/' ? path === '/' : path === base || path.startsWith(`${base}/`)
}
export const isProtectedPath = (path: string) => PROTECTED_PATHS.some(p => under(path, p))

/** Whether one snippet runs on this public path for this visitor. */
export function snippetRuns(snippet: SiteSnippet, path: string, signedIn: boolean) {
  if (!snippet.enabled || !snippet.code.trim() || isProtectedPath(path)) return false
  if (snippet.audience === 'guests' && signedIn || snippet.audience === 'members' && !signedIn) return false
  if (snippet.exclude.some(p => under(path, p))) return false
  return !snippet.paths.length || snippet.paths.some(p => under(path, p))
}

/** What public pages receive: nothing when the master switch is off. */
export const liveSnippets = (settings: SiteCodeSettings) => settings.enabled ? settings.snippets.filter(s => s.enabled && s.code.trim()) : []
export const newSnippetId = () => `sc-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`
