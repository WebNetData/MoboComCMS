'use client';

import { useState } from 'react';
import './marketing-consent.css';
export type MarketingChoice = {
  marketingOptIn: boolean;
  marketingConsentAt: string | null;
};
export default function MarketingConsent({
  value,
  changed,
  fa
}: {
  value: MarketingChoice;
  changed: (next: MarketingChoice) => void;
  fa: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  async function choose(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const r = await fetch('/api/inbox/preferences', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            marketingOptIn: enabled,
            expected: value.marketingOptIn
          })
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error || (fa ? 'انتخاب شما ذخیره نشد' : 'Your choice was not saved'));
      changed(body.marketing);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : fa ? 'انتخاب ذخیره نشد' : 'Could not save');
    } finally {
      setBusy(false);
    }
  }
  return <section className='np-marketing' aria-labelledby='np-marketing-title'><h2 id='np-marketing-title'>{fa ? 'پیشنهادها و مناسبت‌های شخصی' : 'Offers and personal occasions'}</h2><p>{fa ? 'تبریک تولد، پیشنهاد کالاهای موردعلاقه و پیام‌های بازاریابی فقط با انتخاب شما فعال می‌شوند. این انتخاب اختیاری است و هر زمان می‌توانید خاموشش کنید؛ رسید پرداخت و وضعیت سفارش جدا هستند.' : 'Birthday greetings, relevant offers and marketing messages require your choice. This is optional and can be turned off at any time; payment and order notices are separate.'}</p><label><input type='checkbox' checked={value.marketingOptIn} disabled={busy} onChange={e => void choose(e.target.checked)} /><span>{fa ? 'می‌خواهم این پیشنهادها و پیام‌های مناسبتی را دریافت کنم' : 'I would like to receive these offers and occasion messages'}</span></label><p className='muted'>{fa ? 'کانال هر رویداد را در فهرست زیر انتخاب کنید. خاموش‌کردن این گزینه جلوی ارسال بعدیِ پیام‌های بازاریابیِ در صف را هم می‌گیرد.' : 'Choose channels for each event below. Opting out also stops pending marketing messages before delivery.'}</p>{error && <p role='alert'>{error}</p>}<span role='status' aria-live='polite'>{busy ? fa ? 'در حال ذخیره…' : 'Saving…' : saved ? fa ? 'انتخاب شما ذخیره شد' : 'Your choice was saved' : ''}</span></section>;
}
