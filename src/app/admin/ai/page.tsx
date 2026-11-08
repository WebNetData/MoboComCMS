'use client'
import Link from '@/components/AppLink'
import { useCallback, useEffect, useState, useRef } from 'react'
import { configurableAiBase, keylessAi } from '@/modules/ai/domain/ai'
import Economy from './Economy'
import PersonalChatGpt from './PersonalChatGpt'
import AiRouting from './AiRouting'
import CredentialPools from './CredentialPools'

type Provider = { id: string; label: string; model: string; free: boolean; keyUrl: string; note: string }
type Config = { provider: string; model: string; baseUrl: string; apiKey: string; hasKey: boolean; voice: string; botName: string; effectiveModel: string }
type Queues = {
  comments: { id: number; body: string; author: string; createdAt: string; post: { slug: string; title: string } }[]
  threads: { id: number; title: string; board: string; author: string; replies: number; lastPostAt: string }[]
  products: { id: number; name: string; slug: string; kind: string; active: boolean; words: number }[]
  posts: { id: number; title: string; slug: string; status: string; excerpt: string }[]
}
type Tab = 'write' | 'products' | 'comments' | 'forum' | 'meta' | 'settings'
const TABS: { id: Tab; label: string }[] = [
  { id: 'write', label: 'نوشتن مقاله' }, { id: 'products', label: 'توضیحات محصول' }, { id: 'comments', label: 'پاسخ به دیدگاه‌ها' },
  { id: 'forum', label: 'تالار گفتمان' }, { id: 'meta', label: 'توضیح متا (سئو)' }, { id: 'settings', label: 'تنظیمات' },
]

/** AI writing assistant: every result is a draft or a suggestion the admin edits before publishing. */
export default function AdminAiPage() {
  const [tab, setTab] = useState<Tab>('write')
  useEffect(() => {
    const callback = () => { if (location.hash.startsWith('#chatgpt_callback=') || new URLSearchParams(location.search).get('tab') === 'settings') setTab('settings') }
    callback(); window.addEventListener('hashchange', callback)
    return () => window.removeEventListener('hashchange', callback)
  }, [])
  const [config, setConfig] = useState<Config | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [queues, setQueues] = useState<Queues | null>(null)
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState('')
  // drafts keyed by "<kind>:<id>"
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [post, setPost] = useState({ topic: '', keywords: '', length: 'medium', categoryId: '' })
  const [created, setCreated] = useState<{ id: number; title: string; excerpt: string }[]>([])
  const [facts, setFacts] = useState<Record<number, string>>({})
  const [productId, setProductId] = useState(0)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/ai', { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok) { setMessage({ text: data?.error || 'دریافت اطلاعات ناموفق بود', error: true }); return }
    setConfig(data.config); setProviders(data.providers); setQueues(data.queues); setCategories(data.categories)
    if (!data.config.hasKey && !keylessAi(data.config.provider)) setTab('settings')
  }, [])
  useEffect(() => { void load() }, [load])

  async function run(action: string, body: Record<string, unknown>, key: string) {
    setBusy(key); setMessage(null)
    const response = await fetch('/api/admin/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy('')
    if (!response?.ok) { setMessage({ text: data?.error || 'انجام نشد', error: true }); return null }
    return data
  }
  const setDraft = (key: string, value: string) => setDrafts((current) => ({ ...current, [key]: value }))
  const drop = (key: string) => setDrafts((current) => { const next = { ...current }; delete next[key]; return next })

  const saveSettingsRunning = useRef(false)
  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saveSettingsRunning.current) return
    saveSettingsRunning.current = true
    try {
      const form = new FormData(event.currentTarget)
      setBusy('settings'); setMessage(null)
      const response = await fetch('/api/admin/ai', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form)) }).catch(() => null)
      const data = await response?.json().catch(() => null)
      setBusy('')
      if (!response?.ok) { setMessage({ text: data?.error || 'ذخیره نشد', error: true }); return }
      setConfig(data.config)
      setMessage({ text: 'تنظیمات دستیار ذخیره شد', error: false })
    
    } finally { saveSettingsRunning.current = false }
  }

  if (!config || !queues) return <div className="xm-page" dir="rtl">{message ? <div className="xm-notice is-error">{message.text}</div> : <div className="tb-empty">در حال بارگذاری…</div>}</div>
  const provider = providers.find((item) => item.id === config.provider) || providers[0]
  const counts: Partial<Record<Tab, number>> = { comments: queues.comments.length, forum: queues.threads.length, meta: queues.posts.length }
  const product = queues.products.find((item) => item.id === productId)

  return <div className="xm-page ai-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">دستیار هوش مصنوعی</span><h1>دستیار هوش مصنوعی</h1><p>مقاله، توضیحات محصول و پاسخ دیدگاه‌ها و تالار را با هوش مصنوعی بنویسید. همه‌چیز اول پیش‌نویس است؛ شما ویرایش و تأیید می‌کنید و بعد منتشر می‌شود.</p></div>
      <div className="ai-status"><small>سرویس پیش‌فرض سایت</small><b>{provider?.label}</b><small dir="ltr">{config.effectiveModel}</small>{provider?.free ? <span className="badge badge-green">رایگان</span> : <span className="badge">پولی</span>}</div>
    </header>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    <div className="seo-actions"><Link className="btn btn-ghost" href="/admin/ai/operations">دستیار عملیاتی با بررسی و تأیید شما</Link></div>
    <nav className="md-chips seo-filter ai-tabs" aria-label="بخش‌های دستیار">{TABS.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>{item.label}{counts[item.id] ? ` (${counts[item.id]!.toLocaleString('fa-IR')})` : ''}</button>)}</nav>
    <Link className="btn btn-ghost" href="/admin/ai/production">تولید انبوه با Chat وب · متن و تصویر</Link>

    {tab === 'write' && <section className="xm-section">
      <form className="card seo-form" onSubmit={async (event) => {
        event.preventDefault()
        const data = await run('post.draft', post, 'post')
        if (data) { setCreated((list) => [data.post, ...list]); setPost({ ...post, topic: '', keywords: '' }); setMessage({ text: `پیش‌نویس «${data.post.title}» ساخته شد`, error: false }) }
      }}>
        <label className="studio-field seo-wide"><span>موضوع مقاله</span><input className="input" value={post.topic} onChange={(e) => setPost({ ...post, topic: e.target.value })} placeholder="مثلاً: راهنمای خرید هدفون بی‌سیم در سال ۱۴۰۵" required minLength={3} maxLength={300}/></label>
        <label className="studio-field"><span>کلمات کلیدی (اختیاری)</span><input className="input" value={post.keywords} onChange={(e) => setPost({ ...post, keywords: e.target.value })} placeholder="هدفون بی‌سیم، خرید هدفون"/></label>
        <label className="studio-field"><span>طول</span><select className="input" value={post.length} onChange={(e) => setPost({ ...post, length: e.target.value })}><option value="short">کوتاه (~۵۰۰ کلمه)</option><option value="medium">متوسط (~۱۰۰۰ کلمه)</option><option value="long">بلند (~۱۶۰۰ کلمه)</option></select></label>
        <label className="studio-field"><span>دسته‌بندی</span><select className="input" value={post.categoryId} onChange={(e) => setPost({ ...post, categoryId: e.target.value })}><option value="">بدون دسته</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <div className="seo-actions seo-wide"><button type="submit" className="btn btn-primary" disabled={!!busy}>{busy === 'post' ? 'در حال نوشتن… (تا یک دقیقه)' : 'بنویس و پیش‌نویس کن'}</button></div>
        <p className="muted seo-wide">مقاله با وضعیت «پیش‌نویس» در مجله ذخیره می‌شود. قبل از انتشار آن را بخوانید، تصویر شاخص بگذارید و اطلاعات را بررسی کنید.</p>
      </form>
      {created.length > 0 && <div className="ai-list">{created.map((item) => <article key={item.id} className="card"><b>{item.title}</b><p className="muted">{item.excerpt}</p><Link className="btn btn-ghost btn-sm" href="/admin/posts">بازبینی در نوشته‌ها ←</Link></article>)}</div>}
    </section>}

    {tab === 'products' && <section className="xm-section">
      <div className="card seo-form">
        <label className="studio-field seo-wide"><span>محصول</span><select className="input" value={productId} onChange={(e) => setProductId(Number(e.target.value))}><option value={0}>یک محصول انتخاب کنید…</option>{queues.products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.words < 120 ? ` — ${item.words.toLocaleString('fa-IR')} کلمه ⚠` : ''}{item.active ? '' : ' (غیرفعال)'}</option>)}</select></label>
        {product && <>
          <label className="studio-field seo-wide"><span>اطلاعات قطعی (مشخصات، گارانتی، محتوای بسته…) — هوش مصنوعی فقط همین‌ها را به‌عنوان واقعیت می‌نویسد</span><textarea className="input" rows={3} value={facts[product.id] || ''} onChange={(e) => setFacts({ ...facts, [product.id]: e.target.value })}/></label>
          <div className="seo-actions seo-wide"><button type="button" className="btn btn-primary" disabled={!!busy} onClick={async () => {
            const data = await run('product.write', { id: product.id, facts: facts[product.id] || '' }, `product:${product.id}`)
            if (data) setDraft(`product:${product.id}`, data.description)
          }}>{busy === `product:${product.id}` ? 'در حال نوشتن…' : 'نوشتن توضیحات'}</button><Link className="btn btn-ghost" href={`/products/${product.slug}`} target="_blank">مشاهدهٔ محصول ↗</Link></div>
          {drafts[`product:${product.id}`] !== undefined && <div className="seo-wide ai-review">
            <label className="studio-field"><span>پیش‌نمایش HTML (قابل ویرایش)</span><textarea className="input ai-code" dir="ltr" rows={12} value={drafts[`product:${product.id}`]} onChange={(e) => setDraft(`product:${product.id}`, e.target.value)}/></label>
            <div className="ai-preview" dangerouslySetInnerHTML={{ __html: drafts[`product:${product.id}`] }}/>
            <div className="seo-actions"><button type="button" className="btn btn-primary" disabled={!!busy} onClick={async () => {
              if (await run('product.apply', { id: product.id, description: drafts[`product:${product.id}`] }, 'apply')) { drop(`product:${product.id}`); setMessage({ text: 'توضیحات محصول جایگزین شد', error: false }); void load() }
            }}>جایگزینی توضیحات محصول</button><button type="button" className="btn btn-ghost" onClick={() => drop(`product:${product.id}`)}>دور انداختن</button></div>
          </div>}
        </>}
      </div>
    </section>}

    {tab === 'comments' && <section className="xm-section">
      <p className="muted">دیدگاه‌های در انتظار تأیید که هنوز پاسخی ندارند. «انتشار پاسخ» دیدگاه کاربر را تأیید می‌کند و پاسخ شما را زیر آن منتشر می‌کند.</p>
      <div className="ai-list">{queues.comments.map((comment) => {
        const key = `comment:${comment.id}`
        return <article key={comment.id} className="card">
          <header><b>{comment.author}</b><small className="muted"> دربارهٔ <Link href={`/blog/${comment.post.slug}`} target="_blank">{comment.post.title}</Link> · {new Date(comment.createdAt).toLocaleString('fa-IR')}</small></header>
          <blockquote>{comment.body}</blockquote>
          {drafts[key] !== undefined
            ? <><textarea className="input" rows={4} value={drafts[key]} onChange={(e) => setDraft(key, e.target.value)} aria-label="متن پاسخ"/>
              <div className="seo-actions"><button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={async () => { if (await run('comment.publish', { id: comment.id, reply: drafts[key] }, 'publish')) { drop(key); setMessage({ text: 'پاسخ منتشر شد', error: false }); void load() } }}>تأیید دیدگاه و انتشار پاسخ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => drop(key)}>انصراف</button></div></>
            : <div className="seo-actions"><button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={async () => { const data = await run('comment.suggest', { id: comment.id }, key); if (data) setDraft(key, data.reply) }}>{busy === key ? 'در حال نوشتن…' : '✦ پیشنهاد پاسخ'}</button><Link className="btn btn-ghost btn-sm" href="/admin/comments">مدیریت دیدگاه‌ها</Link></div>}
        </article>
      })}{!queues.comments.length && <div className="tb-empty">دیدگاه بی‌پاسخی در انتظار نیست.</div>}</div>
    </section>}

    {tab === 'forum' && <section className="xm-section">
      <p className="muted">موضوع‌های باز که آخرین پیامشان از یک کاربر است. پاسخ با نام «{config.botName}» فرستاده می‌شود تا همه بدانند پاسخ از هوش مصنوعی است.</p>
      <div className="ai-list">{queues.threads.map((thread) => {
        const key = `forum:${thread.id}`
        return <article key={thread.id} className="card">
          <header><Link href={`/forum/t/${thread.id}`} target="_blank"><b>{thread.title}</b></Link><small className="muted"> {thread.board} · {thread.author} · {thread.replies.toLocaleString('fa-IR')} پاسخ · {new Date(thread.lastPostAt).toLocaleString('fa-IR')}</small></header>
          {drafts[key] !== undefined
            ? <><textarea className="input" rows={6} value={drafts[key]} onChange={(e) => setDraft(key, e.target.value)} aria-label="متن پاسخ"/>
              <div className="seo-actions"><button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={async () => { if (await run('forum.publish', { id: thread.id, reply: drafts[key] }, 'publish')) { drop(key); setMessage({ text: 'پاسخ در تالار منتشر شد', error: false }); void load() } }}>انتشار در تالار</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => drop(key)}>انصراف</button></div></>
            : <div className="seo-actions"><button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={async () => { const data = await run('forum.suggest', { id: thread.id }, key); if (data) setDraft(key, data.reply) }}>{busy === key ? 'در حال خواندن گفتگو…' : '✦ پیشنهاد پاسخ'}</button></div>}
        </article>
      })}{!queues.threads.length && <div className="tb-empty">همهٔ موضوع‌ها پاسخ گرفته‌اند.</div>}</div>
    </section>}

    {tab === 'meta' && <section className="xm-section">
      <p className="muted">نوشته‌هایی که خلاصه (توضیح متا) ندارند یا طولش مناسب نیست. بهترین طول ۱۲۰ تا ۱۵۵ حرف است.</p>
      <div className="ai-list">{queues.posts.map((item) => {
        const key = `meta:${item.id}`
        return <article key={item.id} className="card">
          <header><b>{item.title}</b><small className="muted"> {item.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'} · فعلی: {item.excerpt.length.toLocaleString('fa-IR')} حرف</small></header>
          {drafts[key] !== undefined
            ? <><textarea className="input" rows={2} value={drafts[key]} onChange={(e) => setDraft(key, e.target.value)} aria-label="توضیح متا"/><small className="muted">{drafts[key].length.toLocaleString('fa-IR')} حرف</small>
              <div className="seo-actions"><button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={async () => { if (await run('meta.apply', { id: item.id, meta: drafts[key] }, 'apply')) { drop(key); setMessage({ text: 'توضیح متا ذخیره شد', error: false }); void load() } }}>ذخیره</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => drop(key)}>انصراف</button></div></>
            : <div className="seo-actions"><button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={async () => { const data = await run('meta.suggest', { id: item.id }, key); if (data) setDraft(key, data.meta) }}>{busy === key ? 'در حال نوشتن…' : '✦ نوشتن توضیح متا'}</button></div>}
        </article>
      })}{!queues.posts.length && <div className="tb-empty">همهٔ نوشته‌ها توضیح متای مناسب دارند.</div>}</div>
    </section>}

    {tab === 'settings' && <section className="xm-section">
      <PersonalChatGpt />
      <AiRouting />
      <CredentialPools /><Economy />
      <div className="ai-providers">{providers.map((item) => <article key={item.id} className={`card${item.id === config.provider ? ' is-active' : ''}`}><b>{item.label}</b> {item.free ? <span className="badge badge-green">رایگان</span> : <span className="badge">پولی</span>}<p className="muted">{item.note}</p>{item.keyUrl && <a href={item.keyUrl} target="_blank" rel="noreferrer">گرفتن کلید ↗</a>}</article>)}</div>
      <form key={`${config.provider}-${config.apiKey}`} className="card seo-form" onSubmit={saveSettings}>
        <header className="seo-wide"><h2>تنظیمات پیش‌فرض سایت</h2><p className="muted">بخش‌هایی که API مستقل ندارند از این تنظیمات استفاده می‌کنند. اتصال شخصی مدیر فقط در ابزارهای مدیریت و طبق انتخاب همان بخش به کار می‌رود.</p></header>
        <label className="studio-field"><span>سرویس</span><select className="input" name="provider" defaultValue={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value, model: '' })}>{providers.map((item) => <option key={item.id} value={item.id}>{item.label}{item.free ? ' (رایگان)' : ''}</option>)}</select></label>
        <label className="studio-field"><span>کلید API {config.hasKey ? `(ذخیره‌شده: ${config.apiKey})` : ''}</span><input className="input" name="apiKey" type="password" dir="ltr" autoComplete="off" placeholder={config.hasKey ? 'برای تغییر، کلید جدید را وارد کنید' : 'API key'}/></label>
        <label className="studio-field"><span>مدل (خالی = پیش‌فرض)</span><input className="input" name="model" dir="ltr" defaultValue={config.model} placeholder={provider?.model}/></label>
        {configurableAiBase(config.provider) && <label className="studio-field"><span>نشانی سرویس (OpenAI-compatible)</span><input className="input" name="baseUrl" dir="ltr" defaultValue={config.baseUrl} placeholder="http://localhost:11434/v1"/></label>}
        <label className="studio-field"><span>نام حساب پاسخ‌دهنده در تالار</span><input className="input" name="botName" defaultValue={config.botName} maxLength={60}/></label>
        <label className="studio-field seo-wide"><span>لحن و سبک نوشتن برند</span><textarea className="input" name="voice" rows={3} defaultValue={config.voice} maxLength={600}/></label>
        <div className="seo-actions seo-wide"><button type="submit" className="btn btn-primary" disabled={!!busy}>ذخیرهٔ تنظیمات</button><button type="button" className="btn btn-ghost" disabled={!!busy} onClick={async () => { const data = await run('test', {}, 'test'); if (data) setMessage({ text: `اتصال برقرار است (${data.model}): ${data.reply}`, error: false }) }}>{busy === 'test' ? 'در حال آزمایش…' : 'آزمایش اتصال'}</button></div>
        <p className="muted seo-wide">کلید رمزنگاری‌شده ذخیره می‌شود و به مرورگر برنمی‌گردد. متن کاربران فقط به همین سرویس فرستاده می‌شود؛ اگر حریم خصوصی مهم است از مدل روی سرور خودتان استفاده کنید.</p>
      </form>
    </section>}
  </div>
}
