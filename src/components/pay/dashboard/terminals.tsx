"use client";
import { useState } from 'react';
import type { PayChannelType, PayOverview } from "@/modules/billing/domain/pay";
import { PAY_CHANNEL_LABELS } from '@/modules/billing/domain/pay-channels';
import { api, json } from "../client";
import { Field } from "../shared";
import s from "../Pay.module.css";
import BotIntegration from "./bot-integration";
export default function Terminals({
  data,
  busy,
  active,
  action,
  terminalName,
  setTerminalName,
  returnUrl,
  setReturnUrl,
}: {
  data: PayOverview;
  busy: boolean;
  active: boolean;
  action: (fn: () => Promise<unknown>) => Promise<void>;
  terminalName: string;
  setTerminalName: (x: string) => void;
  returnUrl: string;
  setReturnUrl: (x: string) => void;
}) {
 const [baleEnabled, setBaleEnabled] = useState(false);
 const [channelType, setChannelType] = useState<PayChannelType>('WEBSITE');
 const [channelUrl, setChannelUrl] = useState('');
 const webChannel = channelType === 'WEBSITE' || channelType === 'BOT';
  return (
    <><div className={s.split}>
      <section className={s.card}>
        <h2>پایانه‌ها</h2>
        {data.terminals.length ? (
          data.terminals.map((terminal) => (
            <div className={s.row} key={terminal.id}>
              <div>
                <strong>{terminal.name}</strong>
                <small>{PAY_CHANNEL_LABELS[terminal.channelType] || PAY_CHANNEL_LABELS.WEBSITE}</small>
                {(terminal.channelUrl || terminal.returnUrl) && <small className={s.ltr}>{terminal.channelUrl || terminal.returnUrl}</small>}
 <small>تأیید خودکار کارت‌به‌کارت: {terminal.baleEnabled ? 'فعال' : 'غیرفعال'}</small>
              </div>
 <div className={s.actions}>
 <button type="button" className={s.secondary} disabled={busy || !active || !data.merchant?.baleAllowed} onClick={() => action(() => api('/api/pay/terminals', json('PATCH', { id: terminal.id, baleEnabled: !terminal.baleEnabled })))}>{terminal.baleEnabled ? 'غیرفعال کردن تأیید خودکار کارت‌به‌کارت' : 'فعال کردن تأیید خودکار کارت‌به‌کارت'}</button>
              <button
                type="button"
                className={s.secondary}
                disabled={busy || !active}
                onClick={() =>
                  action(() =>
                    api(
                      "/api/pay/terminals",
                      json("PATCH", { id: terminal.id, active: !terminal.active }),
                    ),
                  )
                }
              >
                {terminal.active ? "غیرفعال کردن" : "فعال کردن"}
              </button>
 </div>
            </div>
          ))
        ) : (
          <p>پایانه‌ای ثبت نشده است.</p>
        )}
      </section>
      <form
        className={`${s.card} ${s.stack}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!active) return;
          void action(async () => {
            await api(
              "/api/pay/terminals",
 json("POST", { name: terminalName, channelType, ...(webChannel ? { returnUrl } : channelType === 'PAYMENT_LINK' ? {} : { channelUrl }), baleEnabled: Boolean(data.merchant?.baleAllowed && baleEnabled) }),
            );
            setTerminalName("");
            setReturnUrl("");
            setChannelUrl('');
 setBaleEnabled(false);
          });
        }}
      >
        <h2>پایانه جدید</h2>
        <Field label="نام پایانه">
          <input
            value={terminalName}
            onChange={(e) => setTerminalName(e.target.value)}
          />
        </Field>
        <Field label="نوع پایانه"><select value={channelType} onChange={e => setChannelType(e.target.value as PayChannelType)}>{(Object.entries(PAY_CHANNEL_LABELS) as [PayChannelType, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
 <label className={s.check}><input type="checkbox" checked={Boolean(data.merchant?.baleAllowed && baleEnabled)} disabled={busy || !active || !data.merchant?.baleAllowed} onChange={(e) => setBaleEnabled(e.target.checked)} /> فعال کردن تأیید خودکار کارت‌به‌کارت برای این پایانه</label>
 {!data.merchant?.baleAllowed && <p className={s.muted}>برای فعال‌سازی تأیید خودکار کارت‌به‌کارت، ابتدا مجوز پذیرنده باید توسط مدیریت صادر شود.</p>}
        {webChannel && <Field label="نشانی بازگشت">
          <input
            type="url"
            dir="ltr"
            value={returnUrl}
            onChange={(e) => setReturnUrl(e.target.value)}
          />
        </Field>}
        {!webChannel && channelType !== 'PAYMENT_LINK' && <Field label={channelType === 'INSTAGRAM' ? 'نشانی پروفایل اینستاگرام' : 'نشانی کانال'}><input type="url" dir="ltr" value={channelUrl} onChange={e => setChannelUrl(e.target.value)} required /></Field>}
        <div>
          <button
            type="submit"
            className={s.button}
            disabled={busy || !active || !terminalName || (webChannel ? !returnUrl : channelType !== 'PAYMENT_LINK' && !channelUrl)}
          >
            ثبت پایانه
          </button>
        </div>
      </form>
    </div><BotIntegration data={data} /></>
  );
}
