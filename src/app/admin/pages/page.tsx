'use client'

import { useState } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import AdminCrud, { type FieldDef } from '../cms/AdminCrud'
import { useI18n } from '@/i18n/LocaleProvider'

export default function AdminPagesPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const fa = locale === 'fa'
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const S = {
    body: fa ? 'محتوای صفحه' : 'Page content',
    cover: fa ? 'تصویر شاخص' : 'Featured image',
    publish: fa ? 'انتشار و منو' : 'Publishing & menu',
    look: fa ? 'نمایش صفحه' : 'Page display',
  }
  const fields: FieldDef[] = [
    { section: S.body, key: 'slug', label: t.slug, required: true, dir: 'ltr' },
    { section: S.body, key: 'title', label: t.title, required: true },
    { section: S.cover, key: 'cover', label: t.cover, type: 'image', hideInTable: true },
    { section: S.body, key: 'content', label: t.content, type: 'richtext', hideInTable: true },
    {
      section: S.publish, key: 'status',
      label: t.status,
      type: 'select',
      options: [
        { value: 'PUBLISHED', label: t.published },
        { value: 'DRAFT', label: t.draft },
      ],
    },
    { section: S.publish, key: 'showInNav', label: t.showInNav, type: 'checkbox' },
    { section: S.publish, key: 'sortOrder', label: t.sortOrder, type: 'number', hideInTable: true },
    { section: S.look, key: 'pageLayout', label: 'چیدمان صفحه', type: 'select', options: [{ value: 'full', label: 'تمام‌عرض' }, { value: 'reading', label: 'متمرکز برای مطالعه' }, { value: 'sidebar', label: 'همراه ستون کناری' }] },
    { section: S.look, key: 'pageTitle', label: 'عنوان صفحه', type: 'select', hideInTable: true, options: [{ value: 'show', label: 'نمایش عنوان' }, { value: 'hide', label: 'بدون عنوان' }] },
    { section: S.look, key: 'pageFrame', label: 'کادر محتوا', type: 'select', hideInTable: true, options: [{ value: 'plain', label: 'بدون کادر' }, { value: 'card', label: 'داخل کارت' }] },
    { section: S.look, key: 'formSlug', label: 'فرم پیوست (شناسهٔ فرم از «فرم‌ها و پاسخ‌ها»، مثلاً contact؛ در قالب «تماس با ما» کنار راه‌های ارتباط می‌نشیند)', dir: 'ltr', hideInTable: true },
    { section: S.look, key: 'companyPanel', label: 'قالب طراحی صفحه (متن و فرم همین صفحه داخل طراحی قالب می‌نشیند؛ تماس و نقشه از «اطلاعات تماس و نقشه»)', type: 'select', options: [{ value: 'none', label: 'ساده — با چیدمان و عنوان بالا' }, { value: 'about', label: 'درباره ما — داستان، آمار، بخش‌ها، ارزش‌ها و نقشه' }, { value: 'contact', label: 'تماس با ما — فرم پیوست، راه‌های ارتباط، نقشه و پرسش‌ها' }, { value: 'legal', label: 'سند حقوقی — فهرست مطالب، بخش‌های شماره‌دار، چاپ' }] },
  ]

  // Blank page: create an empty full-width page and jump straight into the builder.
  const createBlankPage = async () => {
    if (creating) return
    setCreating(true)
    setCreateError('')
    try {
      const response = await fetch('/api/admin/cms?type=pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: `page-${Date.now().toString(36)}`,
          title: fa ? 'صفحه جدید' : 'New page',
          titleEn: 'New page',
          status: 'PUBLISHED',
          content: '',
          pageTitle: 'hide',
          pageLayout: 'full',
          pageFrame: 'plain',
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.id) {
        setCreateError(data?.error || (fa ? 'ایجاد صفحه ممکن نشد.' : 'Could not create the page.'))
        return
      }
      router.push(`/admin/builder/${data.id}`)
    } catch {
      setCreateError(fa ? 'ایجاد صفحه ممکن نشد.' : 'Could not create the page.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <AdminCrud
      type="pages"
      fields={fields}
      titleKey="title"
      headerActions={
        <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
          {createError && <span className="error-text">{createError}</span>}
          {/* A new page from a design template opens the page form with the template chosen (a full load, so the form opens). */}
          {fa && <>
            <a className="btn btn-ghost" href="/admin/pages?new=1&companyPanel=about">＋ صفحه با قالب درباره ما</a>
            <a className="btn btn-ghost" href="/admin/pages?new=1&companyPanel=contact&formSlug=contact">＋ صفحه با قالب تماس</a>
            <a className="btn btn-ghost" href="/admin/pages?new=1&companyPanel=legal">＋ سند حقوقی</a>
          </>}
          <button type="button" className="btn btn-ghost" disabled={creating} onClick={() => void createBlankPage()}>
            {creating ? (fa ? 'در حال ایجاد…' : 'Creating…') : fa ? '＋ صفحه خالی' : '+ Blank page'}
          </button>
        </span>
      }
    />
  )
}
