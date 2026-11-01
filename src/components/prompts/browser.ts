export async function promptRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), cache: 'no-store', signal })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'درخواست انجام نشد؛ دوباره تلاش کنید')
  return data as T
}
export function downloadPrompt(text: string, name = 'mobocom-prompt') {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), link = document.createElement('a')
  link.href = url; link.download = name + '.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function copyPrompt(text: string) {
  if (!navigator.clipboard) throw new Error('کپی خودکار در این مرورگر فعال نیست؛ متن را انتخاب و کپی کنید')
  await navigator.clipboard.writeText(text)
}
