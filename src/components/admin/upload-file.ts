const CHUNK = 8 * 1024 * 1024

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || `خطا ${response.status}`)
  return body as T
}

export type Uploaded = { url: string; name: string; size: number; path: string }

/** Sends a file in 8 MB pieces; a dropped connection retries the piece where the server stopped. */
export async function uploadFile(file: File, section: string, onProgress: (sent: number) => void, signal?: AbortSignal): Promise<Uploaded> {
  const start = await json<{ id: string }>('/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'start', name: file.name, size: file.size, section }) })
  let offset = 0
  let failures = 0
  while (offset < file.size) {
    if (signal?.aborted) { await json('/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'cancel', id: start.id }) }).catch(() => undefined); throw new Error('لغو شد') }
    try {
      const piece = file.slice(offset, offset + CHUNK)
      const result = await json<{ received: number }>(`/api/admin/uploads?id=${start.id}&offset=${offset}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: piece, signal })
      offset = result.received
      failures = 0
      onProgress(offset)
    } catch (error) {
      if (signal?.aborted || ++failures > 5) throw error
      await new Promise((resolve) => setTimeout(resolve, 1500 * failures))
    }
  }
  return json<Uploaded>('/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'finish', id: start.id }) })
}
