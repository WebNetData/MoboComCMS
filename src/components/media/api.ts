export async function libraryApi<T>(input: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/admin/media/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'عملیات انجام نشد')
  return body as T
}
export const formatBytes = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
