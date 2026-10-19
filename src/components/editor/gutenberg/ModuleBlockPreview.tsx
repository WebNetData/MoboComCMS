'use client'

import { useContext, useEffect, useState } from 'react'
import type { BlockDefinition } from '@/modules/editor/domain/registry'
import type { ModulePreviewRequest } from '@/modules/editor/domain/contracts'
import { ModulePreviewContext } from './module-preview-context'
import './module-blocks.css'

export default function ModuleBlockPreview({ definition, props }: { definition: BlockDefinition; props: Record<string, unknown> }) {
  const endpoint = useContext(ModulePreviewContext), serialized = JSON.stringify(props)
  const [result, setResult] = useState<{ key: string; html: string; error: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = `${definition.type}:${definition.version}:${serialized}`
  useEffect(() => {
    if (!endpoint) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const request: ModulePreviewRequest = { block: { id: 'module-preview', type: definition.type, version: definition.version, props: JSON.parse(serialized) } }
        const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal })
        const body = await response.json().catch(() => null)
        if (!response.ok || typeof body?.html !== 'string') throw Error('preview failed')
        if (!controller.signal.aborted) setResult({ key, html: body.html, error: false })
      } catch { if (!controller.signal.aborted) setResult({ key, html: '', error: true }) }
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [endpoint, definition.type, definition.version, serialized, key, attempt])
  if (result?.key === key && result.error) return <div className="mc-module-feedback" role="alert">پیش‌نمایش دریافت نشد؛ تنظیمات بلوک محفوظ است. <button type="button" onClick={() => { setResult(null); setAttempt(current => current + 1) }}>تلاش دوباره</button></div>
  return <div className="mc-module-preview" aria-busy={result?.key !== key}>
    {result?.key !== key ? <p className="mc-module-feedback" role="status">در حال دریافت پیش‌نمایش {definition.label.fa}…</p> : result.html ? <div inert dangerouslySetInnerHTML={{ __html: result.html }} /> : <p className="mc-module-feedback">این بخش در حال حاضر برای بازدیدکنندگان نمایش داده نمی‌شود.</p>}
  </div>
}
