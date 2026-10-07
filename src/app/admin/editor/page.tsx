'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'

type PageRow = { id: number; slug: string; title: string; status: string; editorFormat?: string }

/** The pages of the site, each with a way into the block editor, and the switch that lets it save. */
export default function BlockEditorHome() {
  const [pages, setPages] = useState<PageRow[] | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const [state, list] = await Promise.all([
      fetch('/api/admin/editor', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch('/api/admin/cms?type=pages', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).catch(() => null),
    ])
    setEnabled(state ? state.enabled === true : null)
    const rows = Array.isArray(list) ? list : Array.isArray(list?.items) ? list.items : Array.isArray(list?.rows) ? list.rows : null
    setPages(rows)
    if (!state || !rows) setMessage('این بخش برای شما در دسترس نیست یا سرور پاسخ نداد.')
  }, [])
  useEffect(() => { void load() }, [load])

  const toggle = async () => {
    setMessage('')
    const response = await fetch('/api/admin/editor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !enabled }) }).catch(() => null)
    if (!response?.ok) return setMessage(response?.status === 403 ? 'روشن و خاموش کردن ویرایشگر نیاز به دسترسی تنظیمات سایت دارد.' : 'تغییر انجام نشد.')
    setEnabled((await response.json()).enabled === true)
  }

  return (
    <div className="mc-editor-home" dir="rtl">
      <h1>ویرایشگر بلوکی صفحه‌ها</h1>
      <p>صفحه را با بلوک‌ها بچینید: بخش، ستون، متن، تصویر، دکمه و مانند آن. صفحه‌هایی که با ویرایشگر قدیمی نوشته شده‌اند تا وقتی اینجا ذخیره نشوند دست‌نخورده می‌مانند.</p>
      <p className="mc-editor-home-switch">
        <span>وضعیت: <strong>{enabled === null ? '…' : enabled ? 'روشن' : 'خاموش (ذخیره نمی‌شود)'}</strong></span>
        <button type="button" className="btn btn-secondary" onClick={() => void toggle()} disabled={enabled === null}>{enabled ? 'خاموش کردن' : 'روشن کردن'}</button>
      </p>
      {message ? <p role="alert">{message}</p> : null}
      {pages === null ? <p aria-busy="true">در حال بارگذاری…</p> : pages.length === 0 ? <p>هنوز صفحه‌ای ساخته نشده است. از <Link href="/admin/pages">صفحه‌ها</Link> یکی بسازید.</p> : (
        <table className="table">
          <thead><tr><th>صفحه</th><th>نشانی</th><th>وضعیت</th><th>نوشته‌شده با</th><th></th></tr></thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id}>
                <td>{page.title}</td>
                <td dir="ltr">/p/{page.slug}</td>
                <td>{page.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'}</td>
                <td>{page.editorFormat === 'blocks-v1' ? 'بلوک‌ها' : 'ویرایشگر قدیمی'}</td>
                <td><Link href={`/admin/editor/pages/${page.id}`}>ویرایش با بلوک‌ها</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
