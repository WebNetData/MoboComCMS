'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'

type PageRow = { id: number; slug: string; title: string; status: string; editorFormat?: string }
type Kind = 'pages' | 'posts'
const KINDS: Record<Kind, { label: string; path: string; form: string }> = { pages: { label: 'صفحه‌ها', path: '/p/', form: '/admin/pages' }, posts: { label: 'نوشته‌های مجله', path: '/blog/', form: '/admin/posts' } }

/** The pages of the site, each with a way into the block editor, and the switch that lets it save. */
export default function BlockEditorHome() {
  const [kind, setKind] = useState<Kind>('pages')
  const [pages, setPages] = useState<PageRow[] | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const [state, list] = await Promise.all([
      fetch('/api/admin/editor', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`/api/admin/cms?type=${kind}`, { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).catch(() => null),
    ])
    setEnabled(state ? state.enabled === true : null)
    const rows = Array.isArray(list) ? list : Array.isArray(list?.items) ? list.items : Array.isArray(list?.rows) ? list.rows : null
    setPages(rows)
    setMessage(!state || !rows ? 'این بخش برای شما در دسترس نیست یا سرور پاسخ نداد.' : '')
  }, [kind])
  useEffect(() => { void load() }, [load])

  return (
    <div className="mc-editor-home" dir="rtl">
      <h1>ویرایشگر بلوکی</h1>
      <p>ویرایشگر اصلی سایت: صفحه‌ها و نوشته‌های مجله با بلوک‌ها نوشته می‌شوند (بخش، ستون، متن، تصویر، دکمه و مانند آن). آنچه با ویرایشگر قدیمی نوشته شده، هنگام باز شدن به بلوک تبدیل می‌شود و تا ذخیره نکنید دست‌نخورده می‌ماند.</p>
      <p role="tablist" className="mc-editor-home-switch">{(Object.keys(KINDS) as Kind[]).map((key) => <button key={key} type="button" role="tab" aria-selected={kind === key} className={`btn ${kind === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setPages(null); setKind(key) }}>{KINDS[key].label}</button>)}</p>
      <p className="muted text-sm">این ویرایشگر یک افزونه است؛ از <Link href="/admin/extensions">صفحهٔ افزونه‌ها</Link> فعال و غیرفعال می‌شود.{enabled === false ? ' اکنون غیرفعال است.' : ''}</p>
      {message ? <p role="alert">{message}</p> : null}
      {pages === null ? <p aria-busy="true">در حال بارگذاری…</p> : pages.length === 0 ? <p>هنوز چیزی ساخته نشده است. از <Link href={KINDS[kind].form}>{KINDS[kind].label}</Link> یکی بسازید.</p> : (
        <table className="table">
          <thead><tr><th>عنوان</th><th>نشانی</th><th>وضعیت</th><th>نوشته‌شده با</th><th></th></tr></thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id}>
                <td>{page.title}</td>
                <td dir="ltr">{KINDS[kind].path}{page.slug}</td>
                <td>{page.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'}</td>
                <td>{page.editorFormat === 'blocks-v1' ? 'بلوک‌ها' : 'ویرایشگر قدیمی'}</td>
                <td><Link href={`/admin/editor/${kind}/${page.id}`}>ویرایش با بلوک‌ها</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
