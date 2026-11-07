'use client';

import { inputInteger } from './types';
import JalaliDateInput from '@/components/date/JalaliDateInput';
import { useEffect, useState } from 'react';
import { ENGAGEMENT_CHANNELS, ENGAGEMENT_LABELS, SEGMENT_LABELS, SEGMENTS, type EngagementJourney } from '@/modules/automation/domain/engagement';
function ProductPicker({
  value,
  change
}: {
  value: number;
  change: (value: number) => void;
}) {
  const [q, setQ] = useState(''),
    [items, setItems] = useState<{
      id: number;
      name: string;
    }[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void fetch(`/api/admin/crm/engagement?products=1&q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
        cache: 'no-store'
      }).then(async r => {
        if (!r.ok) throw Error('فهرست کالا دریافت نشد');
        return r.json();
      }).then(body => {
        setItems(body.products);
        setError('');
      }).catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);
  return <div className="ce-product-picker"><label>جست‌وجوی کالا<input className="input" type="search" maxLength={80} value={q} onChange={e => setQ(e.target.value)} /></label><label>کالای عمومی<select className="input" value={value || ''} onChange={e => change(Number(e.target.value) || 0)}><option value="">بدون کالای مشخص</option>{value && !items.some(p => p.id === value) && <option value={value}>کالای انتخاب‌شده #{value}</option>}{items.map(p => <option key={p.id} value={p.id}>{p.name} · #{p.id}</option>)}</select></label><p className="muted" role="status">{loading ? 'در حال جست‌وجو…' : error || 'حداکثر۳۰ نتیجهٔ عمومی؛ کالای محدود به گروه یا غیرفعال در فهرست نیست.'}</p></div>;
}
export default function JourneyEditor({
  journey,
  change,
  disabled
}: {
  journey: EngagementJourney;
  change: (next: EngagementJourney) => void;
  disabled: boolean;
}) {
  const patch = (value: Partial<EngagementJourney>) => change({
    ...journey,
    ...value
  });
  return <fieldset className="ce-editor" disabled={disabled}>
  <legend>{ENGAGEMENT_LABELS[journey.kind]}</legend>
  <div className="ce-form-grid"><label>نام ارتباط<input className="input" maxLength={100} required value={journey.name} onChange={e => patch({
          name: e.target.value
        })} /></label><label className="ce-check"><input type="checkbox" checked={journey.enabled} onChange={e => patch({
          enabled: e.target.checked
        })} />این ارتباط پس از ذخیره فعال باشد</label></div>
  <section aria-labelledby="ce-message"><h3 id="ce-message">پیام و مقصد</h3><label>عنوان اعلان<input className="input" required maxLength={160} value={journey.title} onChange={e => patch({
          title: e.target.value
        })} /></label><label>متن پیام<textarea className="input" required rows={4} maxLength={1500} value={journey.body} onChange={e => patch({
          body: e.target.value
        })} /></label><p className="muted">جایگزین‌ها: {'{name}'} نام کاربر، {'{product}'} نام کالا و {'{brand}'} نام سایت. کد تخفیف واقعی را از بخش کوپن‌ها بسازید و در متن بنویسید؛ قیمت و اعتبار نهایی را فروشگاه بررسی می‌کند.</p><label>پیوند همین سایت<input className="input" dir="ltr" maxLength={500} value={journey.href} onChange={e => patch({
          href: e.target.value
        })} /></label><div className="ce-channel-group" role="group" aria-label="کانال‌های بیرون از حساب"><b>اعلان حساب همیشه ثبت می‌شود؛ کپی بیرون از حساب:</b>{ENGAGEMENT_CHANNELS.map(channel => <label className="ce-check" key={channel}><input type="checkbox" checked={journey.channels.includes(channel)} onChange={e => patch({
            channels: e.target.checked ? [...journey.channels, channel] : journey.channels.filter(c => c !== channel)
          })} />{{
            sms: 'پیامک',
            email: 'ایمیل',
            push: 'اعلان مرورگر'
          }[channel]}</label>)}</div><p className="muted">ارسال به فعال‌بودن پنل، تنظیمات رویداد و انتخاب‌های دریافت همان کاربر وابسته است.</p></section>
  <section aria-labelledby="ce-audience"><h3 id="ce-audience">مخاطبان</h3><p className="muted">فقط کاربران فعالی که دریافت ارتباط بازاریابی را انتخاب کرده‌اند. همهٔ شرط‌های زیر باید برقرار باشند.</p><div className="ce-form-grid"><label>گروه مشتری<select className="input" value={journey.segment} onChange={e => patch({
            segment: e.target.value as EngagementJourney['segment']
          })}>{SEGMENTS.map(value => <option key={value} value={value}>{SEGMENT_LABELS[value]}</option>)}</select></label><label>برچسب‌های CRM، جدا با ویرگول<input className="input" maxLength={250} value={journey.tags.join('، ')} onChange={e => patch({
            tags: e.target.value.trim() ? e.target.value.split(/[,،]/).map(v => v.trim()) : []
          })} /></label></div><p className="muted">برای برچسب‌ها، داشتن حداقل یکی از برچسب‌های نوشته‌شده کافی است.</p>{journey.kind !== 'birthday' && <ProductPicker value={journey.productId} change={productId => patch({
        productId
      })} />}<div className="ce-form-grid">{journey.kind === 'winback' && <label>حداقل روزهای غیبت<input className="input" type="number" min={3} max={730} value={journey.inactiveDays} onChange={e => patch({
            inactiveDays: inputInteger(e.currentTarget, journey.inactiveDays)
          })} /></label>}{journey.productId > 0 && <label>پس از خرید همان کالا، چند روز پیشنهاد نرود؟<input className="input" type="number" min={0} max={365} value={journey.purchaseQuietDays} onChange={e => patch({
            purchaseQuietDays: inputInteger(e.currentTarget, journey.purchaseQuietDays)
          })} /></label>}</div>{journey.kind === 'product-interest' && <p className="muted">کاربر باید اعلانِ همان کالا را از قبل دنبال کرده باشد؛ علاقه از مرور صفحه حدس زده نمی‌شود.</p>}</section>
  <section aria-labelledby="ce-schedule"><h3 id="ce-schedule">زمان‌بندی</h3><div className="ce-form-grid"><label>از تاریخ<JalaliDateInput aria-label="از تاریخ" value={journey.startsOn} onChange={startsOn => patch({
            startsOn
          })} /></label><label>تا تاریخ<JalaliDateInput aria-label="تا تاریخ" value={journey.endsOn} onChange={endsOn => patch({
            endsOn
          })} /></label>{journey.kind !== 'birthday' && <label>تکرار پس از چند روز؛ صفر یعنی یک‌بار<input className="input" type="number" min={0} max={365} value={journey.cadenceDays} onChange={e => patch({
            cadenceDays: inputInteger(e.currentTarget, journey.cadenceDays)
          })} /></label>}</div><p className="muted">{journey.kind === 'birthday' ? 'تولد برای هر کاربر در هر سالِ تقویم انتخابی، یک‌بار ثبت می‌شود.' : 'هر کاربر در هر دوره فقط یک پیام از این مسیر می‌گیرد؛ ویرایش متن، پیام قبلی را تکرار نمی‌کند.'} بازهٔ ساعت و سقف ارتباط از تنظیمات ارسال اعمال می‌شوند. کپی بیرونیِ پیام روز گذشته ارسال نمی‌شود.</p></section>
 </fieldset>;
}
