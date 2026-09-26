'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { renderMarkdown } from '@/modules/forum/domain/markdown'

export type ComposerCategory = { id: number; title: string; color: string; parentId: number | null }
type Mention = { username: string; name: string; avatar: string; avatarColor: string }

export type ComposerProps = {
  mode: 'topic' | 'reply' | 'edit'
  heading?: string
  initial?: { title?: string; content?: string; categoryId?: number; tags?: string[] }
  categories?: ComposerCategory[]
  /** Editing the first post also edits the title, tags and category. */
  editTopic?: boolean
  draftKey?: string
  submitLabel: string
  busyLabel?: string
  onSubmit: (value: { title: string; content: string; categoryId: number; tags: string[] }) => Promise<string | null>
  onCancel?: () => void
  autoFocus?: boolean
}

const TOOLS: { label: string; title: string; wrap: [string, string]; block?: boolean; placeholder: string }[] = [
  { label: 'B', title: 'پررنگ', wrap: ['**', '**'], placeholder: 'متن پررنگ' },
  { label: 'I', title: 'مورب', wrap: ['*', '*'], placeholder: 'متن مورب' },
  { label: 'H', title: 'تیتر', wrap: ['## ', ''], block: true, placeholder: 'تیتر' },
  { label: '❝', title: 'نقل‌قول', wrap: ['> ', ''], block: true, placeholder: 'نقل‌قول' },
  { label: '•', title: 'فهرست', wrap: ['- ', ''], block: true, placeholder: 'مورد فهرست' },
  { label: '</>', title: 'کد', wrap: ['`', '`'], placeholder: 'code' },
  { label: '🔗', title: 'پیوند', wrap: ['[', '](https://)'], placeholder: 'متن پیوند' },
  { label: '🖼', title: 'تصویر', wrap: ['![', '](https://)'], placeholder: 'توضیح تصویر' },
]

const readDraft = (key?: string) => { try { return key ? window.localStorage.getItem(key) : null } catch { return null } }
const writeDraft = (key: string | undefined, value: string) => { try { if (!key) return; if (value.trim()) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key) } catch { /* storage unavailable */ } }

export default function Composer(props: ComposerProps) {
  const { mode, initial, categories = [], draftKey } = props
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [categoryId, setCategoryId] = useState<number>(initial?.categoryId || categories[0]?.id || 0)
  const [tags, setTags] = useState((initial?.tags || []).join(' '))
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mentions, setMentions] = useState<Mention[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const area = useRef<HTMLTextAreaElement>(null)
  const topicFields = mode === 'topic' || props.editTopic

  // Restore an unsent draft once (never over an explicit initial text, e.g. a quote).
  useEffect(() => {
    if (initial?.content) return
    const draft = readDraft(draftKey)
    if (draft) setContent(draft)
  }, [draftKey, initial?.content])
  useEffect(() => { if (mode !== 'edit') writeDraft(draftKey, content) }, [content, draftKey, mode])
  useEffect(() => { if (props.autoFocus) area.current?.focus() }, [props.autoFocus])

  // @mention autocomplete for the word before the caret.
  useEffect(() => {
    const el = area.current
    if (!el) return
    const before = content.slice(0, el.selectionStart)
    const match = /(^|[\s(])@([a-z0-9_]{1,20})$/i.exec(before)
    if (!match) { setMentions([]); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/forum/users?q=${encodeURIComponent(match[2])}`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)).then((data) => { setMentions(data?.users || []); setMentionIndex(0) }).catch(() => undefined)
    }, 180)
    return () => { clearTimeout(timer); controller.abort() }
  }, [content])

  function applyMention(user: Mention) {
    const el = area.current
    if (!el) return
    const caret = el.selectionStart
    const before = content.slice(0, caret).replace(/@([a-z0-9_]{1,20})$/i, `@${user.username} `)
    const next = before + content.slice(caret)
    setContent(next)
    setMentions([])
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length) })
  }

  function tool(index: number) {
    const el = area.current
    if (!el) return
    const { wrap, block, placeholder } = TOOLS[index]
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = content.slice(start, end) || placeholder
    const prefix = block && start > 0 && content[start - 1] !== '\n' ? '\n' : ''
    const inserted = block ? selected.split('\n').map((line) => `${wrap[0]}${line}`).join('\n') : `${wrap[0]}${selected}${wrap[1]}`
    const next = content.slice(0, start) + prefix + inserted + content.slice(end)
    setContent(next)
    requestAnimationFrame(() => {
      el.focus()
      const from = start + prefix.length + (block ? wrap[0].length : wrap[0].length)
      el.setSelectionRange(from, from + selected.length)
    })
  }

  async function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    const failure = await props.onSubmit({ title, content, categoryId, tags: tags.split(/[\s,،]+/).filter(Boolean) })
    setBusy(false)
    if (failure) { setError(failure); return }
    if (mode !== 'edit') writeDraft(draftKey, '')
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentions.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setMentionIndex((i) => (i + 1) % mentions.length); return }
      if (event.key === 'ArrowUp') { event.preventDefault(); setMentionIndex((i) => (i - 1 + mentions.length) % mentions.length); return }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); applyMention(mentions[mentionIndex]); return }
      if (event.key === 'Escape') { setMentions([]); return }
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit() }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'b' || event.key === 'i')) { event.preventDefault(); tool(event.key === 'b' ? 0 : 1) }
  }

  const preview = useMemo(() => (tab === 'preview' ? renderMarkdown(content) : ''), [tab, content])
  const tops = categories.filter((c) => !c.parentId || !categories.some((p) => p.id === c.parentId))

  return (
    <form className="fx-composer" onSubmit={submit}>
      {props.heading && <div className="fx-composer-head"><strong>{props.heading}</strong>{props.onCancel && <button type="button" className="fx-icon-btn" onClick={props.onCancel} aria-label="بستن">✕</button>}</div>}
      {topicFields && (
        <div className="fx-composer-fields">
          <input className="input fx-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان موضوع — در یک جمله بگویید دربارهٔ چیست" aria-label="عنوان موضوع" required minLength={5} maxLength={150} />
          {categories.length > 0 && (
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} aria-label="دسته‌بندی">
              {tops.map((c) => [<option key={c.id} value={c.id}>{c.title}</option>, ...categories.filter((child) => child.parentId === c.id).map((child) => <option key={child.id} value={child.id}>— {child.title}</option>)])}
            </select>
          )}
          <input className="input" dir="auto" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="برچسب‌ها (با فاصله جدا کنید)" aria-label="برچسب‌ها" />
        </div>
      )}
      <div className="fx-composer-bar">
        <div className="fx-tools" role="toolbar" aria-label="قالب‌بندی">
          {TOOLS.map((item, index) => <button key={item.title} type="button" title={item.title} aria-label={item.title} onClick={() => tool(index)} disabled={tab === 'preview'}>{item.label}</button>)}
        </div>
        <div className="fx-composer-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? 'is-active' : ''} onClick={() => setTab('write')}>نوشتن</button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'is-active' : ''} onClick={() => setTab('preview')}>پیش‌نمایش</button>
        </div>
      </div>
      <div className="fx-composer-body">
        {tab === 'write' ? (
          <>
            <textarea ref={area} className="fx-textarea" value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={onKeyDown} dir="auto" rows={mode === 'topic' ? 12 : 7} required minLength={2} maxLength={20000}
              placeholder={mode === 'topic' ? 'متن موضوع را بنویسید… (Markdown، @نام‌کاربری، :emoji:)' : 'پاسخ شما… (Ctrl+Enter برای ارسال)'} aria-label="متن پیام" />
            {mentions.length > 0 && (
              <ul className="fx-mentions" role="listbox" aria-label="کاربران">
                {mentions.map((user, index) => (
                  <li key={user.username} role="option" aria-selected={index === mentionIndex}>
                    <button type="button" className={index === mentionIndex ? 'is-active' : ''} onMouseDown={(e) => { e.preventDefault(); applyMention(user) }}>
                      {user.avatar ? <img src={user.avatar} alt="" className="fx-avatar" width={22} height={22} /> : <span className="fx-avatar" style={{ width: 22, height: 22, fontSize: 10, background: user.avatarColor }}>{user.name.slice(0, 1)}</span>}
                      <b>{user.name}</b><bdi dir="ltr">@{user.username}</bdi>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="fx-preview fx-cooked" dangerouslySetInnerHTML={{ __html: preview || '<p class="fx-muted">چیزی برای پیش‌نمایش نیست.</p>' }} />
        )}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="fx-composer-foot">
        <button className="btn btn-primary" disabled={busy || content.trim().length < 2 || (!!topicFields && title.trim().length < 5)}>{busy ? (props.busyLabel || 'در حال ارسال…') : props.submitLabel}</button>
        {props.onCancel && <button type="button" className="btn btn-ghost" onClick={props.onCancel}>انصراف</button>}
        <small className="fx-muted">{content.length.toLocaleString('fa-IR')} / ۲۰٬۰۰۰</small>
      </div>
    </form>
  )
}
