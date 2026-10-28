'use client'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import type { PostStyleAlign, PostStyleBase } from '@/modules/journal/domain/post-styles'
import PostStyleThumb from '../journal/PostStyleThumb'
import css from '../journal/post-styles.module.css'

type Option = { id: string; fa: string; group: 'style' | 'mystyle' | 'theme' | 'builtin' | 'mine'; status?: string; base?: string; accent?: string; align?: string; sidebar?: boolean }

/**
 * «استایل صفحه» in the article form (the magazine's manager): automatic (the format's or the magazine's choice),
 * a designed or own style, or a builder layout. A saved article changes at once through the per-article layout
 * choice (`/api/admin/builder/post-template`); a new one keeps the pick until it is first saved (`onPending`).
 */
export default function PostStylePanel({ postId, slug, live, onPending }: { postId: number | null; slug?: string; live?: boolean; onPending: (id: string) => void }) {
  const [options, setOptions] = useState<Option[]>([])
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    if (!postId) onPending('')
    void fetch(postId ? `/api/admin/builder/post-template?postId=${postId}` : '/api/admin/builder/post-template?options=post', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive && data) { setOptions(data.options || []); setValue(data.templateId || '') } })
      .catch(() => undefined)
    return () => { alive = false }
  }, [postId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(id: string) {
    setNote('')
    if (!postId) { setValue(id); onPending(id); setNote(id ? 'پس از ذخیرهٔ نوشته اعمال می‌شود.' : ''); return }
    const before = value
    setValue(id); setBusy(true)
    const response = await fetch('/api/admin/builder/post-template', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, templateId: id }) }).catch(() => null)
    setBusy(false)
    if (response?.ok) setNote('استایل صفحه ذخیره شد.')
    else { setValue(before); setNote('تغییر استایل انجام نشد؛ دوباره تلاش کنید.') }
  }

  const styles = options.filter((option) => option.group === 'style' || option.group === 'mystyle')
  // The ready-made article templates are cards too; the owner's own builder templates are in the list below.
  const ready = options.filter((option) => option.group === 'builtin' && option.id.startsWith('post-pro-'))
  const layouts = options.filter((option) => option.group !== 'style' && option.group !== 'mystyle' && !ready.includes(option))
  const isLayout = layouts.some((option) => option.id === value)
  const preview = slug && live && (value.startsWith('ps') || ready.some((option) => option.id === value)) ? `/blog/${slug}?style=${value}` : slug && live ? `/blog/${slug}` : ''

  return (
    <section className={`sa-card ${css.panel}`} aria-labelledby="post-style-title">
      <header className="sa-card-head"><h2 id="post-style-title">استایل صفحه</h2><small>ظاهر صفحهٔ همین نوشته</small></header>
      <div className={css.panelGrid} role="group" aria-labelledby="post-style-title" aria-busy={busy}>
        <button type="button" className={css.option} aria-pressed={value === ''} disabled={busy} onClick={() => void pick('')}>
          <PostStyleThumb base="" layout />خودکار
        </button>
        {styles.map((option) => (
          <button key={option.id} type="button" className={css.option} aria-pressed={value === option.id} disabled={busy} onClick={() => void pick(option.id)}>
            <PostStyleThumb base={(option.base || 'classic') as PostStyleBase} accent={option.accent} align={(option.align || 'start') as PostStyleAlign} />{option.fa}
          </button>
        ))}
      </div>
      {ready.length > 0 && <>
        <p className={css.panelNote} id="post-template-title">قالب‌های آمادهٔ نوشته</p>
        <div className={css.panelGrid} role="group" aria-labelledby="post-template-title" aria-busy={busy}>
          {ready.map((option) => (
            <button key={option.id} type="button" className={css.option} aria-pressed={value === option.id} disabled={busy} onClick={() => void pick(option.id)}>
              <PostStyleThumb base={(option.base || 'classic') as PostStyleBase} sidebar={option.sidebar} />{option.fa}
            </button>
          ))}
        </div>
      </>}
      {layouts.length > 0 && (
        <label className={css.panelRow}>
          <span>یا قالب صفحه‌ساز:</span>
          <select className="input" value={isLayout ? value : ''} disabled={busy} onChange={(event) => void pick(event.target.value)}>
            <option value="">—</option>
            {layouts.map((option) => <option key={option.id} value={option.id}>{option.fa}{option.status === 'draft' ? ' (پیش‌نویس)' : ''}</option>)}
          </select>
        </label>
      )}
      <p className={css.panelNote} role="status">{note || (value === '' ? 'خودکار: استایل نوع این نوشته یا پیش‌فرض مجله.' : '')}</p>
      <div className={css.panelRow}>
        {preview && <a className="btn btn-ghost" href={preview} target="_blank" rel="noreferrer">پیش‌نمایش صفحه</a>}
        <Link className="sa-link" href="/admin/journal/styles">مدیریت استایل‌ها</Link>
      </div>
    </section>
  )
}
