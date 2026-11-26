"use client";
import type {
  PayAdminOverview,
  PaySettings,
} from "@/modules/billing/domain/pay";
import { Field } from "../shared";
import s from "../Pay.module.css";
import SmsSources from './sms-sources';
import Link from '@/components/AppLink';
export default function Settings({
  data,
  settings,
  update,
  action,
  busy,
}: {
  data: PayAdminOverview;
  settings: PaySettings;
  update: (patch: Partial<PaySettings>) => void;
  action: (url: string, body: unknown) => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className={s.stack}>
    <section className={`${s.card} ${s.stack}`} aria-labelledby="pay-auto-setup-title"><h2 id="pay-auto-setup-title">تأیید خودکار با پیامک بانکی</h2><p className={s.muted}>حساب مقصد را در تنظیمات درگاه انتخاب کنید، منبع پیامک را برای همان حساب فعال کنید و مجوز پذیرنده و پایانه را بررسی کنید.</p><nav className={s.actions} aria-label="راه‌اندازی پیامک بانکی"><a className={s.secondary} href="#sms-forwarder-guide-title">راهنمای SMS Forwarder</a><Link className={s.secondary} href="/admin/gateways">تنظیم حساب مقصد</Link><Link className={s.secondary} href="/admin/mobocom-pay/merchants">مجوز پذیرنده و پایانه</Link></nav></section>
    <section className={`${s.card} ${s.stack}`}>
      <h2>تنظیمات دریافت و تسویه</h2>
      <label className={s.check}>
        <input
          type="checkbox"
          checked={settings.incomingEnabled}
          onChange={(e) => update({ incomingEnabled: e.target.checked })}
        />{" "}
        فعال بودن دریافت
      </label>
      <Field label="شناسه ارائه‌دهنده بانک">
        <input
          value={settings.providerId}
          onChange={(e) => update({ providerId: e.target.value })}
        />
      </Field>
      <fieldset>
        <legend>حساب‌های بانکی</legend>
        {data.bankAccounts.map((a) => (
          <label key={a.id} className={s.row}>
            <span>
              {a.title} · {a.bankName} · {a.cardNumber}
              {!a.active && " (غیرفعال)"}
 {a.collectionUse === 'MOBOCOM_PAY' && ' · اختصاصی درگاه موبوکام؛ خارج از روش‌های دستی'}
            </span>
            <input
              type="checkbox"
 disabled={a.collectionUse === 'MOBOCOM_PAY'}
 checked={a.collectionUse !== 'MOBOCOM_PAY' && settings.bankAccountIds.includes(a.id)}
              onChange={(e) =>
                update({
                  bankAccountIds: e.target.checked
                    ? [...settings.bankAccountIds, a.id]
                    : settings.bankAccountIds.filter((id) => id !== a.id),
                })
              }
            />
          </label>
        ))}
      </fieldset>
      <div className={s.grid}>
        {(
          [
            ["feeBps", "کارمزد (نقطه پایه)"],
            ["flatFeeRial", "کارمزد ثابت ریال"],
            ["feeCapRial", "سقف مجموع کارمزد ریال؛ صفر بدون سقف"],
            ["minPaymentRial", "حداقل پرداخت ریال"],
            ["maxPaymentRial", "حداکثر پرداخت ریال"],
            ["minSettlementRial", "حداقل تسویه ریال"],
            ["paymentMinutes", "مهلت پرداخت (دقیقه)"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              dir="ltr"
              inputMode="numeric"
              value={settings[key]}
              onChange={(e) => {
                const v = e.target.value;
                if (key === "feeBps" || key === "paymentMinutes") {
                  if (/^\d+$/.test(v) && Number.isSafeInteger(Number(v)))
                    update({ [key]: Number(v) });
                } else update({ [key]: v });
              }}
            />
          </Field>
        ))}
      </div>
 <fieldset className={s.stack}>
 <legend>سیاست تطبیق پیامک بانکی</legend>
 <label className={s.check}><input type="checkbox" checked={settings.bale.enabled} onChange={(e) => update({ bale: { ...settings.bale, enabled: e.target.checked } })} /> فعال</label>
 <p className={s.muted}>هزینهٔ خدمت پلتفرم جداگانه به مشتری اعلام می‌شود. مبلغ‌های اختصاص‌یافته هرگز دوباره استفاده نمی‌شوند. حساب بانکی اختصاصی و منبع تأییدشده لازم است. شمارش مهلت پرداخت بلافاصله آغاز می‌شود.</p>
 <Link href="/admin/bank-accounts">مدیریت حساب‌های بانکی</Link>
 <div className={s.grid}>
 <Field label="حداقل هزینهٔ تشخیص (ریال)"><input dir="ltr" inputMode="numeric" value={settings.bale.minAdjustmentRial} onChange={(e) => update({ bale: { ...settings.bale, minAdjustmentRial: e.target.value } })} /></Field>
 <Field label="حداکثر هزینهٔ تشخیص (ریال)"><input dir="ltr" inputMode="numeric" value={settings.bale.maxAdjustmentRial} onChange={(e) => update({ bale: { ...settings.bale, maxAdjustmentRial: e.target.value } })} /></Field>
 <Field label="مهلت پرداخت (۵ تا ۱۲۰ دقیقه)"><input dir="ltr" type="number" min={5} max={120} value={settings.bale.minutes} onChange={(e) => { const value = e.target.value; if (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))) update({ bale: { ...settings.bale, minutes: Number(value) } }) }} /></Field>
 </div>
 </fieldset>
      <h3>مسیرهای تسویه</h3>
      <Field label="آستانهٔ تأیید دو مدیر (ریال؛ صفر یعنی غیرفعال)"><input dir="ltr" inputMode="numeric" value={settings.settlementApprovalThresholdRial} onChange={e => update({ settlementApprovalThresholdRial: e.target.value })} /></Field>
      <p className={s.muted}>برای درخواست‌های جدید با مبلغ معادل ریالی برابر یا بالاتر از آستانه، تأیید دو مدیر متفاوت لازم است. سیاست هر درخواست هنگام رزرو ثبت می‌شود.</p>
      <Field label="حداکثر عمر نرخ USDT (دقیقه، ۱۵ تا ۱۴۴۰)"><input dir="ltr" type="number" min={15} max={1440} value={settings.usdtRateMaxAgeMinutes ?? 60} onChange={e => { const raw = e.target.value; const value = Number(raw); if (raw.trim() && Number.isInteger(value)) update({ usdtRateMaxAgeMinutes: value }) }} /></Field>
      <p className={s.muted}>نرخ ریالی از تنظیمات فعلی تأمین می‌شود؛ نرخ ناموجود یا قدیمی مانع دریافت نرخ تسویه است.</p>
      {settings.rails.map((r, index) => (
        <fieldset key={r.id}>
          <legend>
            {r.asset} · {r.network}{r.id === "USDT_BSC" && " · Binance-Peg BSC-USD (bridged)"}
          </legend>
          <label className={s.check}>
            <input
              type="checkbox"
              checked={r.enabled}
              onChange={(e) =>
                update({
                  rails: settings.rails.map((x, i) =>
                    i === index ? { ...x, enabled: e.target.checked } : x,
                  ),
                })
              }
            />{" "}
            فعال
          </label>
          <div className={s.railFields}>
            {(["rialPerUnit"] as const).map((key) => (
              <Field
                key={key}
                label={
                  key === "rialPerUnit" ? "ریال به ازای واحد" : "کارمزد ریال"
                }
              >
                <input
                  dir="ltr"
                  value={r[key]}
                  onChange={(e) =>
                    update({
                      rails: settings.rails.map((x, i) =>
                        i === index ? { ...x, [key]: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
            ))}
            <Field label="واحد کارمزد"><select value={r.fees?.currency ?? "IRR"} onChange={e => update({ rails: settings.rails.map((x, i) => i === index ? { ...x, fees: { ...(x.fees ?? { currency: "IRR", bps: 0, flat: x.feeRial, cap: "0" }), currency: e.target.value as "IRR" | "USDT" } } : x) })}><option value="IRR">ریال</option><option value="USDT">USDT</option></select></Field>
            <Field label="نرخ کارمزد (هر ۱۰۰ واحد برابر ۱٪)"><input type="number" dir="ltr" min={0} step={1} value={r.fees?.bps ?? 0} onChange={e => { const raw = e.target.value; const bps = Number(raw); if (raw.trim() && Number.isSafeInteger(bps) && bps >= 0) update({ rails: settings.rails.map((x, i) => i === index ? { ...x, fees: { ...(x.fees ?? { currency: "IRR", bps: 0, flat: x.feeRial, cap: "0" }), bps } } : x) }) }} /></Field>
            {([['flat', 'کارمزد ثابت'], ['cap', 'سقف کارمزد؛ صفر بدون سقف']] as const).map(([key, label]) => <Field key={key} label={label}><input dir="ltr" inputMode="decimal" value={r.fees?.[key] ?? (key === 'flat' ? r.feeRial : '0')} onChange={e => update({ rails: settings.rails.map((x, i) => i === index ? { ...x, fees: { ...(x.fees ?? { currency: 'IRR', bps: 0, flat: x.feeRial, cap: '0' }), [key]: e.target.value } } : x) })} /></Field>)}
          </div>
        </fieldset>
      ))}
      <div>
        <button
          type="button"
          className={s.button}
          disabled={busy}
          onClick={() =>
            action("/api/admin/mobocom-pay/settings", {
              ...settings,
              settingsRevision: data.settingsRevision,
            })
          }
        >
          ذخیره تنظیمات
        </button>
      </div>
    </section>
 <SmsSources bankAccounts={data.bankAccounts} />
    </div>
  );
}
