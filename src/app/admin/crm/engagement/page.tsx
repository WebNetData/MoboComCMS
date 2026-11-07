'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from '@/components/AppLink';
import Icon from '@/components/site/Icon';
import { ENGAGEMENT_DEFAULTS, ENGAGEMENT_KINDS, ENGAGEMENT_LABELS, type EngagementKind, type EngagementJourney, type EngagementSettings } from '@/modules/automation/domain/engagement';
import JourneyEditor from './JourneyEditor';
import DeliverySettings from './DeliverySettings';
import CommunicationLog from './CommunicationLog';
import { REASONS, type EngagementState, type Preview } from './types';
import './engagement.css';
const starter = (kind: EngagementKind): EngagementJourney => ({
  id: crypto.randomUUID(),
  name: ENGAGEMENT_LABELS[kind],
  kind,
  enabled: false,
  title: kind === 'birthday' ? '{name} عزیز، تولدت مبارک' : kind === 'winback' ? '{name} عزیز، خوشحال می‌شویم دوباره ببینیمتان' : 'پیشنهادی برای شما',
  body: kind === 'birthday' ? '{name} عزیز، برایت سالی پر از اتفاق‌های خوب آرزو می‌کنیم. با مهر، {brand}' : kind === 'product-interest' ? 'برای بررسی پیشنهاد فعلیِ {product}، صفحهٔ کالا را ببینید. {brand}' : kind === 'winback' ? 'از آخرین دیدارتان مدتی گذشته؛ هر زمان به ما نیاز داشتید کنارتان هستیم. {brand}' : 'پیشنهادهای فعلی ما را در سایت بررسی کنید. {brand}',
  href: '/products',
  channels: [],
  segment: 'all',
  tags: [],
  productId: 0,
  cadenceDays: kind === 'winback' ? 30 : 0,
  inactiveDays: 30,
  purchaseQuietDays: 30,
  startsOn: '',
  endsOn: ''
});
type View = 'journeys' | 'settings' | 'log';
export default function CrmEngagement() {
  const [data, setData] = useState<EngagementState | null>(null),
    [doc, setDoc] = useState<EngagementSettings>(ENGAGEMENT_DEFAULTS);
  const [baseline, setBaseline] = useState(''),
    [selected, setSelected] = useState(''),
    [view, setView] = useState<View>('journeys');
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{
      base: string;
      data: Preview;
    } | null>(null),
    [previewing, setPreviewing] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/crm/engagement', {
          cache: 'no-store'
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error || 'دریافت ارتباط‌ها انجام نشد');
      setData(body);
      setDoc(body.settings);
      setBaseline(JSON.stringify(body.settings));
      setPreview(null);
      setSelected(previous => body.settings.journeys.some((j: EngagementJourney) => j.id === previous) ? previous : body.settings.journeys[0]?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ارتباط برقرار نشد');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const dirty = !!data && JSON.stringify(doc) !== baseline,
    journey = doc.journeys.find(j => j.id === selected);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function add(kind: EngagementKind) {
    if (doc.journeys.length >= 20) return;
    const j = starter(kind);
    setDoc(previous => ({
      ...previous,
      journeys: [...previous.journeys, j]
    }));
    setSelected(j.id);
    setView('journeys');
    setPreview(null);
    setNotice('پیش‌نویس ساخته شد؛ هنوز ذخیره یا فعال نشده است');
  }
  async function save() {
    if (!data || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/admin/crm/engagement', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': data.revision
          },
          body: JSON.stringify({
            settings: doc
          })
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error || 'ذخیره انجام نشد');
      setDoc(body.settings);
      setBaseline(JSON.stringify(body.settings));
      setData(previous => previous ? {
        ...previous,
        settings: body.settings,
        revision: body.revision
      } : previous);
      setPreview(null);
      setNotice('تنظیمات ذخیره شد؛ فقط مسیرهای فعال، طبق زمان و شرایط کاربر بررسی می‌شوند');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ذخیره نشد؛ ویرایش‌های شما حفظ شده‌اند');
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    if (!journey || previewing) return;
    setPreviewing(true);
    setError('');
    const base = JSON.stringify(doc);
    try {
      const r = await fetch('/api/admin/crm/engagement', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            settings: doc,
            journeyId: journey.id
          })
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error || 'پیش‌نمایش دریافت نشد');
      setPreview({
        base,
        data: body
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'پیش‌نمایش دریافت نشد');
    } finally {
      setPreviewing(false);
    }
  }
  function remove() {
    if (!journey || !window.confirm('این مسیر از فهرست حذف شود؟ پس از ذخیره، پیام تازه‌ای از آن ارسال نمی‌شود؛ سابقهٔ ارتباط‌ها حفظ می‌شود.')) return;
    setDoc(previous => ({
      ...previous,
      journeys: previous.journeys.filter(j => j.id !== journey.id)
    }));
    setSelected('');
    setPreview(null);
  }
  if (loading) return <div className='ce-page' role='status'>در حال دریافت ارتباط با مشتری…</div>;
  if (!data) return <div className='ce-page'><h1>ارتباط با مشتری</h1><p role='alert'>{error}</p><button type='button' className='btn btn-ghost' onClick={() => void load()}>تلاش دوباره</button></div>;
  return <div className='ce-page' dir='rtl'>
    <header className='ce-header'><div><Link href='/admin/crm' className='muted'>پرونده‌های مشتریان</Link><h1>ارتباط با مشتری</h1><p>پیام مناسب، برای مشتری علاقه‌مند، در زمان مناسب</p></div><div className='ce-header-actions'><span className='ce-pill'>وضعیت ذخیره‌شده: {data.settings.enabled ? 'ارسال خودکار روشن' : 'ارسال خودکار متوقف'}</span><button type='button' className='btn btn-primary' disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : dirty ? 'ذخیرهٔ تغییرات' : 'ذخیره شده'}</button></div></header>
    <div className='ce-summary'><div><b>{data.overview.consenting.toLocaleString('fa-IR')}</b><span>کاربرِ فعال با انتخاب دریافت پیشنهاد</span></div><div><b>{data.overview.total.toLocaleString('fa-IR')}</b><span>ارتباط ثبت‌شده در۳۰ روز گذشته</span></div><p>مسیرها تا ذخیره و فعال‌کردن شما، پیش‌نویس‌اند. هیچ کاربری صرفاً به‌خاطر ثبت‌نام وارد بازاریابی نمی‌شود.</p></div>
    <nav className='ce-nav' aria-label='بخش‌های ارتباط با مشتری'>{([['journeys', 'مسیرهای ارتباطی'], ['settings', 'تنظیمات ارسال'], ['log', 'سابقهٔ ارتباط']] as const).map(([key, label]) => <button type='button' key={key} className={view === key ? 'is-active' : ''} aria-pressed={view === key} aria-controls='ce-view' onClick={() => setView(key)}>{label}</button>)}<Link href='/admin/history?type=settings-crm-engagement&id=1'>تاریخچهٔ تنظیمات</Link></nav>
    {error && <p role='alert' className='ce-error'>{error} ویرایش‌های ذخیره‌نشده را پیش از بارگذاری دوباره نگه دارید.</p>}{notice && <p role='status' className='ce-notice'>{notice}</p>}{dirty && <p className='ce-unsaved'>تغییرات این صفحه هنوز ذخیره نشده‌اند.</p>}
    <div id='ce-view'>{view === 'settings' ? <DeliverySettings value={doc} change={setDoc} dateFields={data.dateFields} disabled={busy} /> : view === 'log' ? <><button type='button' className='btn btn-ghost' onClick={() => {
          if (!dirty || window.confirm('تغییرات ذخیره‌نشده کنار گذاشته شوند؟')) void load();
        }}>تازه‌سازی سابقه و تنظیمات</button><CommunicationLog notices={data.overview.notices} total={data.overview.total} /></> : <>
      <section className='ce-starters' aria-labelledby='ce-start'><div><h2 id='ce-start'>ساخت مسیر ارتباطی</h2><p className='muted'>از یک الگو شروع کنید، مخاطب و پیام را تنظیم کنید، سپس پیش‌نمایش بگیرید</p></div><div>{ENGAGEMENT_KINDS.map(kind => <button type='button' className='btn btn-ghost' key={kind} disabled={busy || doc.journeys.length >= 20} onClick={() => add(kind)}><Icon name={kind === 'birthday' ? 'gift' : kind === 'product-interest' ? 'heart' : 'mail'} size={17} />{ENGAGEMENT_LABELS[kind]}</button>)}</div></section>
      <div className='ce-workspace'><aside className='ce-journeys' aria-label='ارتباط‌های شما'><h2>ارتباط‌های شما</h2>{!doc.journeys.length ? <p className='muted'>هنوز مسیری نساخته‌اید؛ از الگوهای بالا شروع کنید.</p> : doc.journeys.map(j => <button type='button' key={j.id} className={selected === j.id ? 'is-selected' : ''} aria-pressed={selected === j.id} onClick={() => {
              setSelected(j.id);
              setPreview(null);
            }}><b>{j.name}</b><small>{ENGAGEMENT_LABELS[j.kind]} · {j.enabled ? dirty ? 'فعال پس از ذخیره' : 'فعال' : 'پیش‌نویس'}</small></button>)}</aside><div className='ce-edit-pane'>{journey ? <><JourneyEditor key={journey.id} journey={journey} disabled={busy} change={next => setDoc(previous => ({
                ...previous,
                journeys: previous.journeys.map(j => j.id === next.id ? next : j)
              }))} /><div className='ce-editor-actions'><button type='button' className='btn btn-primary' disabled={busy || previewing} onClick={() => void inspect()}>{previewing ? 'در حال بررسی نمونه…' : 'پیش‌نمایش مخاطب و پیام'}</button><button type='button' className='btn btn-ghost' disabled={busy} onClick={remove}>حذف مسیر از فهرست</button></div></> : <div className='ce-empty'><Icon name='mail' size={28} /><h2>یک ارتباط را انتخاب یا ایجاد کنید</h2><p>ثبت سابقه و ارسال واقعی، پس از ذخیره و فعال‌سازی و با انتخاب خود کاربر انجام می‌شود.</p></div>}
        {preview && <section className='ce-preview' aria-labelledby='ce-preview-title'><h2 id='ce-preview-title'>پیش‌نمایش بدون ارسال</h2>{preview.base !== JSON.stringify(doc) && <p role='alert'>طرح از زمان پیش‌نمایش تغییر کرده است؛ دوباره بررسی کنید.</p>}<p>از اولین {preview.data.limit.toLocaleString('fa-IR')} کاربر واجد انتخاب، {preview.data.scanned.toLocaleString('fa-IR')} مورد بررسی شد و {preview.data.eligible.toLocaleString('fa-IR')} مورد با شرط‌ها مطابق بود. این نمونه، شمارش تمام مخاطبان یا تضمین ارسال نیست؛ سقف روزانه و کانال هنگام صف‌گذاری بررسی می‌شوند.</p><p className='muted'>بازهٔ ساعت: {preview.data.contactWindowOpen ? 'باز' : 'بسته'} · وضعیت ذخیره‌نشدهٔ مسیر: {preview.data.enabled ? 'فعال' : 'ارسال متوقف'}</p>{!!Object.keys(preview.data.reasons).length && <ul>{Object.entries(preview.data.reasons).map(([reason, count]) => <li key={reason}>{REASONS[reason] || reason}: {count.toLocaleString('fa-IR')}</li>)}</ul>}{preview.data.sample.map(item => <article key={item.id}><header><b>{item.name}</b><Link href={`/admin/crm/${item.id}`}>پروندهٔ مشتری</Link></header><h3>{item.title}</h3><p>{item.body}</p><span className='muted' dir='ltr'>{item.href}</span></article>)}</section>}
      </div></div>
    </>}</div><footer className='ce-foot'><Link href='/admin/store/marketing'>پیگیری موجودی، سبد رهاشده و باشگاه مشتریان</Link><Link href='/admin/automation'>قانون‌های عمومی اتوماسیون</Link><Link href='/dashboard/notifications/preferences'>انتخاب‌های دریافت در حساب من</Link></footer>
  </div>;
}
