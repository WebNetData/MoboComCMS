'use client'
import { useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { ThemeTemplateMeta } from '@/modules/site/domain/theme-templates'
import styles from './homepage.module.css'

type Preset = { id: string; name: string; description: string; module: string; sections: number }
type State = { revision: string; templates: ThemeTemplateMeta[]; selectedId: string | null; presets: Preset[]; modules: Record<string, boolean>; createdId?: string }
const endpoint = '/api/admin/homepage'
const icons: Record<string, string> = { hosting: 'server', journal: 'book', store: 'bag', music: 'music', cinema: 'film', software: 'download', games: 'gamepad' }

export default function HomepageSettings() {
  const [data, setData] = useState<State | null>(null), [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), [failed, setFailed] = useState(false)
  const running = useRef(false)
  useEffect(() => { const controller = new AbortController(); void fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error || 'فهرست طرح‌ها دریافت نشد'); setData(body) }).catch(e => { if (!controller.signal.aborted) { setFailed(true); setNotice(e.message) } }); return () => controller.abort() }, [])
  async function action(key: string, method: string, body?: object) {
    if (running.current) return
    running.current = true; setBusy(key); setFailed(false); setNotice('')
    try { const response = await fetch(endpoint, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), value = await response.json(); if (!response.ok) throw new Error(value.error || 'تغییر طرح انجام نشد'); setData(value); setNotice(method === 'POST' ? 'نسخهٔ قابل ویرایش ساخته شد؛ ابتدا پیش‌نمایش را بررسی کنید، سپس آن را صفحهٔ اول کنید. صفحهٔ فعلی تغییر نکرد.' : method === 'PUT' ? 'صفحهٔ اول انتخاب شد؛ طرح‌های قبلی و محتوایشان حفظ شده‌اند.' : 'فهرست تازه شد') }
    catch (e) { setFailed(true); setNotice(e instanceof Error ? e.message : 'عملیات انجام نشد') }
    finally { running.current = false; setBusy('') }
  }
  const selected = data?.templates.find(t => t.id === data.selectedId)
  const fallback = !!selected?.solution && data?.modules[selected.solution] === false
  return <div className={`xm-page ${styles.page}`} dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">یک پلتفرم، تجربهٔ تخصصی شما</span><h1>طرح صفحهٔ اول</h1><p>طرح فعلی را نگه دارید یا خانه‌ای متناسب با کارتان بسازید. هر طرح با صفحه‌ساز قابل ویرایش است؛ انتخاب آن، ماژول‌ها و منوهای سایت را خودکار تغییر نمی‌دهد.</p></div><div className={styles.actions}><Link className="btn btn-ghost" href="/" target="_blank" rel="noreferrer">مشاهدهٔ سایت</Link><Link className="btn btn-ghost" href="/admin/branding">هویت سایت</Link></div></header>
    {notice && <p className={`xm-notice${failed ? ' is-error' : ''}`} role={failed ? 'alert' : 'status'}>{notice}</p>}
    <div className={styles.actions}><button className="btn btn-ghost" type="button" disabled={!!busy} onClick={() => void action('refresh', 'GET')}>تازه‌کردن فهرست</button><Link className="btn btn-ghost" href="/admin/theme-builder">همهٔ قالب‌ها</Link><Link className="btn btn-ghost" href="/admin/studio">تنظیم منو و ظاهر</Link></div>
    {!data && !notice && <p role="status">در حال دریافت طرح‌ها…</p>}
    {data && <>
      <section className={`card ${styles.current}`} aria-labelledby="hp-current"><div><span className="badge">{fallback ? 'طرح انتخاب‌شده؛ نمایش فعلاً از طرح اصلی' : 'در حال نمایش در /'}</span><h2 id="hp-current">{selected?.name || 'صفحه‌ساز خانه / طرح اصلی سایت'}</h2><p>بازگشت به طرح اصلی، قالب‌های ساخته‌شده را حذف نمی‌کند. نسخهٔ قبلی را می‌توانید دوباره انتخاب کنید.</p>{fallback && <p role="status">بخش این طرح خاموش یا در حال نگهداری است؛ تا بازگشت بخش، صفحه‌ساز خانه / طرح اصلی نمایش داده می‌شود.</p>}</div><div className={styles.actions}><Link className="btn btn-ghost" href={selected ? `/admin/builder/${selected.id}` : '/admin/builder/home'}>ویرایش طرح فعلی</Link><button className="btn btn-ghost" type="button" disabled={!!busy || !data.selectedId} onClick={() => void action('default', 'PUT', { revision: data.revision, templateId: null })}>بازگشت به صفحه‌ساز خانه / طرح اصلی</button></div></section>
      <section aria-labelledby="hp-library"><h2 id="hp-library">طرح‌های تخصصی</h2><p className="muted">ابتدا یک نسخهٔ پیش‌نویس بسازید؛ متن، ترتیب، رنگ و افکت‌ها را ویرایش کنید و پس از پیش‌نمایش، آن را صفحهٔ اول کنید.</p><div className={styles.grid}>{data.presets.map(p => <article className={`card ${styles.card}`} key={p.id}>
        <div className={styles.preview} data-kind={p.module} aria-hidden="true"><Icon name={icons[p.module]} size={36} /><div className={styles.lines}><i /><i /><i /></div><div className={styles.tiles}><i /><i /><i /><i /></div></div><div><span className="badge">{p.sections.toLocaleString('fa-IR')} بخش قابل ویرایش</span><h3>{p.name}</h3><p>{p.description}</p></div>{!data.modules[p.module] && <p className="muted">ماژول این بخش خاموش است؛ می‌توانید طرح بسازید، اما برای نمایش باید بخش را از مدیریت افزونه‌ها فعال کنید.</p>}<button className="btn btn-primary" type="button" disabled={!!busy} onClick={() => void action(p.id, 'POST', { presetId: p.id })}>{busy === p.id ? 'در حال ساخت…' : `ساخت نسخهٔ ${p.name}`}</button>
      </article>)}</div></section>
      <section aria-labelledby="hp-owned"><h2 id="hp-owned">نسخه‌های شما</h2><p className="muted">«انتشار و انتخاب» این نسخه را در آدرس اصلی سایت نمایش می‌دهد. برای برگشت، نسخهٔ دیگری را انتخاب کنید؛ چیزی پاک نمی‌شود.</p><div className={styles.grid}>{data.templates.filter(template => ['none', 'home'].includes(template.placement.kind)).map(template => <article className={`card ${styles.card}`} key={template.id} data-created={data.createdId === template.id || undefined}><div><span className="badge">{template.id === data.selectedId ? 'صفحهٔ اول فعلی' : template.status === 'published' ? 'منتشرشده' : 'پیش‌نویس'}</span><h3>{template.name}</h3><small>{new Date(template.updatedAt).toLocaleDateString('fa-IR')}</small></div><div className={styles.actions}><Link className="btn btn-ghost" href={`/admin/builder/${template.id}`}>ویرایش</Link><Link className="btn btn-ghost" href={`/admin/builder/preview/${template.id}`} target="_blank" rel="noreferrer">پیش‌نمایش</Link></div><button className="btn btn-primary" type="button" disabled={!!busy || template.id === data.selectedId || (!!template.solution && !data.modules[template.solution])} onClick={() => void action(template.id, 'PUT', { templateId: template.id, revision: data.revision })}>{busy === template.id ? 'در حال انتخاب…' : `انتشار و انتخاب ${template.name}`}</button></article>)}</div>{!data.templates.some(template => ['none', 'home'].includes(template.placement.kind)) && <p className="card">هنوز نسخهٔ مستقلی نساخته‌اید؛ طرح اصلی سایت همچنان در دسترس است.</p>}</section>
    </>}
  </div>
}
