// ============ Helpers ============
export function joinUrl(base: string, path: string) {
  return base.replace(/\/+$/, '') + path
}

export async function httpJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15000, ...rest } = init
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal, cache: 'no-store' })
    const text = await res.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    return { res, data, text }
  } finally {
    clearTimeout(t)
  }
}

export function gbToBytes(gb: number) {
  return Math.round(gb * 1024 * 1024 * 1024)
}

function bytesToGb(bytes: number) {
  return Math.max(0, Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100)
}

/** Surfaces a panel validation error instead of a bare "Validation failed". */
export function formatPanelError(data: any, status: number) {
  const errors = data?.errors
  if (Array.isArray(errors) && errors.length) {
    const detail = errors
      .slice(0, 3)
      .map((e: any) => `${(e?.path || []).join('.') || 'body'}: ${e?.message || e?.code || 'invalid'}`)
      .join('; ')
    return `${data?.message || `HTTP ${status}`} — ${detail}`
  }
  return data?.message || data?.error || `HTTP ${status}`
}
