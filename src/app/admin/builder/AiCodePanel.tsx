'use client'
import { useMemo, useRef, useState } from 'react'
import { requestChatWeb } from '@/modules/ai/client/chat-web'
import type { CodeBundle, CodeResult, CodeTarget, CodeWarning } from '@/modules/ai/domain/code-assist'

type L = (en: string, fa: string) => string
type Proposal = { code: CodeResult; warnings: CodeWarning[]; model: string }
const VARS = ['--primary', '--primary-soft', '--text', '--muted', '--bg', '--card', '--border', '--success', '--warning', '--danger']

/** The scope a block already uses, or a fresh one: CSS of advanced code is global, so each block keeps its own root class. */
const scopeOf = (html: string) => html.match(/mc-x-[a-z0-9]{6,12}/)?.[0] || `mc-x-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`

/** A sandboxed copy of the page's colours and font, so the preview looks like the site without touching it. */
function previewDoc(code: CodeBundle) {
  const root = getComputedStyle(document.documentElement), body = getComputedStyle(document.body)
  const vars = VARS.map(name => `${name}:${root.getPropertyValue(name).trim()}`).filter(v => !v.endsWith(':')).join(';')
  const escapeScript = (js: string) => js.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html><html dir="${document.documentElement.dir || 'rtl'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${vars}}body{margin:0;padding:16px;background:var(--bg);color:var(--text);font-family:${body.fontFamily}}</style><style>${code.css.replace(/<\/style/gi, '')}</style></head><body>${code.html}<script>${escapeScript(code.js)}</script></body></html>`
}

export default function AiCodePanel({ target, current, L, onApply }: { target: CodeTarget; current: CodeBundle; L: L; onApply: (code: CodeBundle) => void }) {
  const [instruction, setInstruction] = useState(''), [transport, setTransport] = useState<'api' | 'chat-web'>('api'), [edit, setEdit] = useState(true)
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [proposal, setProposal] = useState<Proposal | null>(null), [view, setView] = useState<'preview' | keyof CodeBundle>('preview'), [width, setWidth] = useState(390)
  const scope = useMemo(() => scopeOf(current.html), [current.html])
  const abort = useRef<AbortController | null>(null)
  const hasCode = !!(current.html || current.css || current.js), cssOnly = target === 'css'

  async function call(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/builder/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.current?.signal })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || 'درخواست انجام نشد')
    return data
  }
  async function run() {
    abort.current?.abort(); abort.current = new AbortController()
    setBusy(transport === 'api' ? 'در حال نوشتن کد…' : 'در حال آماده‌سازی…'); setError(''); setProposal(null)
    const input = { target, instruction, scope, current: edit && hasCode ? current : { html: '', css: '', js: '' } }
    try {
      if (transport === 'api') setProposal(await call({ phase: 'generate', input }))
      else {
        const { prompt } = await call({ phase: 'prepare', input })
        setBusy('در Chat وب در حال نوشتن…')
        const text = await requestChatWeb(prompt, AbortSignal.any([abort.current.signal, AbortSignal.timeout(240000)]))
        setBusy('در حال بررسی پاسخ…')
        setProposal(await call({ phase: 'complete', input, text }))
      }
      setView(target === 'css' ? 'css' : 'preview')
    } catch (e) { if (!abort.current?.signal.aborted) setError(e instanceof Error ? e.message : 'کد ساخته نشد') }
    finally { setBusy('') }
  }
  const danger = proposal?.warnings.some(w => w.level === 'danger')

  return <details className="bld-ai-code" open={!!proposal}>
    <summary><span aria-hidden="true">✦</span> {L('Write with AI', 'ساخت و ویرایش کد با هوش مصنوعی')}</summary>
    <label className="bld-field"><span>{L('What should it build or change?', 'چه بسازد یا چه چیزی را تغییر دهد؟')}</span>
      <textarea className="textarea" rows={4} maxLength={3000} value={instruction} placeholder={cssOnly ? L('e.g. glass background, soft glow on hover', 'مثلاً «پس‌زمینهٔ شیشه‌ای، سایهٔ نرم و درخشش هنگام رفتن نشانگر؛ در موبایل فاصلهٔ کمتر»') : L('e.g. an animated pricing card with a glowing border', 'مثلاً «کارت قیمت با حاشیهٔ درخشان و انیمیشن ورود؛ سه ستون در دسکتاپ و یک ستون در موبایل»')} onChange={e => setInstruction(e.target.value)} /></label>
    <div className="bld-ai-row" role="radiogroup" aria-label={L('Connection', 'روش اتصال')}>
      <label><input type="radio" name={`ai-code-${scope}`} checked={transport === 'api'} onChange={() => setTransport('api')} />{L('Site AI service (API)', 'سرویس هوش مصنوعی سایت (API)')}</label>
      <label><input type="radio" name={`ai-code-${scope}`} checked={transport === 'chat-web'} onChange={() => setTransport('chat-web')} />{L('My Chat web (browser extension)', 'Chat وب شخصی من (افزونهٔ مرورگر)')}</label>
    </div>
    {hasCode && <label className="bld-check"><input type="checkbox" checked={edit} onChange={e => setEdit(e.target.checked)} />{L('Start from the current code', 'بر اساس کد فعلی (اصلاح، نه ساخت از صفر)')}</label>}
    <div className="bld-ai-row">
      <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || instruction.trim().length < 5} onClick={() => void run()}>{busy || (hasCode && edit ? L('Improve code', 'اصلاح کد') : L('Build code', 'ساخت کد'))}</button>
      {busy && <button type="button" className="btn btn-ghost btn-sm" onClick={() => abort.current?.abort()}>{L('Stop', 'توقف')}</button>}
    </div>
    {error && <p role="alert" className="bld-warning">{error}</p>}
    {proposal && <div className="bld-ai-result" aria-live="polite">
      {proposal.code.summary && <p className="bld-ai-summary">{proposal.code.summary}</p>}
      {proposal.warnings.length > 0 && <ul className="bld-ai-warnings">{proposal.warnings.map(w => <li key={w.title} data-level={w.level}><b>{w.title}</b> {w.detail}</li>)}</ul>}
      <div className="bld-ai-tabs" role="tablist">{(target === 'css' ? ['css'] as const : ['preview', 'html', 'css', 'js'] as const).map(v => <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'is-selected' : ''} onClick={() => setView(v)}>{v === 'preview' ? L('Preview', 'پیش‌نمایش') : v.toUpperCase()}</button>)}</div>
      {view === 'preview'
        ? <><div className="bld-ai-sizes">{[390, 820, 1280].map(w => <button key={w} type="button" className={width === w ? 'is-selected' : ''} onClick={() => setWidth(w)}>{w}</button>)}</div>
          <div className="bld-ai-frame"><iframe title={L('Isolated preview', 'پیش‌نمایش جدا')} sandbox="allow-scripts" srcDoc={previewDoc(proposal.code)} style={{ width }} /></div></>
        : <textarea className="textarea bld-code mono" dir="ltr" rows={12} value={proposal.code[view]} onChange={e => setProposal({ ...proposal, code: { ...proposal.code, [view]: e.target.value } })} />}
      <p className="muted text-sm">{L('The preview runs in an isolated frame. Inserting only changes this draft; saving still needs your review and the code permission.', 'پیش‌نمایش در قاب جدا اجرا می‌شود و به سایت دسترسی ندارد. «جایگزین کردن» فقط پیش‌نویس همین صفحه را تغییر می‌دهد و با Ctrl+Z برمی‌گردد؛ ذخیره و انتشار با بازبینی شماست.')} · {proposal.model}</p>
      <div className="bld-ai-row">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { onApply({ html: proposal.code.html, css: proposal.code.css, js: proposal.code.js }); setProposal(null); setInstruction('') }}>{danger ? L('Insert anyway', 'با آگاهی از هشدارها جایگزین کن') : L('Insert into the block', 'جایگزین کردن در بلوک')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProposal(null)}>{L('Discard', 'رد کردن')}</button>
      </div>
    </div>}
  </details>
}
