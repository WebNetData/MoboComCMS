'use client'

import { useContext, useEffect, useState } from 'react'
import type { BlockDefinition } from '@/modules/editor/domain/registry'
import type { ModuleItemChoice, ModulePreviewRequest } from '@/modules/editor/domain/contracts'
import { ModulePreviewContext } from './module-preview-context'
import './module-blocks.css'

type Item = ModuleItemChoice
export default function ModuleItemsControl({ definition, value, onChange }: { definition: BlockDefinition; value: unknown; onChange: (items: Array<{ id: number }>) => void }) {
  const endpoint = useContext(ModulePreviewContext), [query, setQuery] = useState(''), [attempt, setAttempt] = useState(0)
  const ids = (Array.isArray(value) ? value : []).map(item => Number((item as { id?: unknown }).id)), idsKey = JSON.stringify(ids)
  const [result, setResult] = useState<{ key: string; items: Item[]; selected: Item[]; error: boolean } | null>(null)
  const key = `${definition.type}:${query.trim()}:${idsKey}`
  useEffect(() => {
    if (!endpoint) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const request: ModulePreviewRequest = { action: 'items', type: definition.type, query: query.trim(), ids: JSON.parse(idsKey) }
        const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal })
        const body = await response.json().catch(() => null)
        if (!response.ok || !Array.isArray(body?.items) || !Array.isArray(body?.selected)) throw Error('picker failed')
        if (!controller.signal.aborted) setResult({ key, items: body.items, selected: body.selected, error: false })
      } catch { if (!controller.signal.aborted) setResult({ key, items: [], selected: [], error: true }) }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [endpoint, definition.type, query, idsKey, key, attempt])
  const names = new Map((result?.selected || []).map(item => [item.id, item.title]))
  const move = (index: number, step: number) => { const next = [...ids]; [next[index], next[index + step]] = [next[index + step], next[index]]; onChange(next.map(id => ({ id }))) }
  return <fieldset className="mc-module-picker"><legend>انتخاب و ترتیب موردها</legend>
    <label>جست‌وجو در {definition.label.fa}<input type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="حداقل دو حرف از عنوان…" /></label>
    {result?.key !== key ? <p role="status">در حال دریافت فهرست…</p> : result.error ? <p role="alert">فهرست دریافت نشد. <button type="button" onClick={() => setAttempt(current => current + 1)}>تلاش دوباره</button></p> : query.trim().length >= 2 && !result.items.length ? <p role="status">مورد عمومی مطابق جست‌وجو پیدا نشد.</p> : null}
    {result?.key === key && !result.error && <ul className="mc-module-results">{result.items.filter(item => !ids.includes(item.id)).map(item => <li key={item.id}><button type="button" disabled={ids.length >= 24} onClick={() => onChange([...ids, item.id].map(id => ({ id })))}>{item.title}<span>افزودن</span></button></li>)}</ul>}
    {ids.length ? <ol className="mc-module-selected">{ids.map((id, index) => <li key={id}><span>{names.get(id) || `مورد ${id.toLocaleString('fa-IR')}`}</span><div>
      <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`بالا بردن مورد ${index + 1}`}>↑</button>
      <button type="button" disabled={index === ids.length - 1} onClick={() => move(index, 1)} aria-label={`پایین بردن مورد ${index + 1}`}>↓</button>
      <button type="button" onClick={() => onChange(ids.filter(value => value !== id).map(id => ({ id })))} aria-label={`حذف مورد ${index + 1}`}>×</button>
    </div></li>)}</ol> : <p>هنوز موردی انتخاب نشده است.</p>}
    <p className="mc-module-help">فقط موارد قابل نمایش عمومی انتخاب می‌شوند. ترتیب انتخاب حفظ می‌شود؛ حداکثر ۲۴ مورد.</p>
  </fieldset>
}
