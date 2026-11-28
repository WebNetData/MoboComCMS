"use client";
import { useEffect, useState, type FormEvent } from "react";
import type {
  PayAdminOverview,
  PaySettings,
} from "@/modules/billing/domain/pay";
import { ErrorNotice, Field } from "../shared";
import s from "../Pay.module.css";
import SmsSources from './sms-sources';
import Link from '@/components/AppLink';
import OperatorGuide from "./operator-guide";
import layout from "../WorkspaceContent.module.css";
import FeeFields from "./fee-fields";
import { readFeeFields } from "./fee-form-values";
import feeStyle from "./FeeFields.module.css";
import { latinDigits } from "@/shared/text/digits";
export default function Settings({
  data,
  settings,
  update,
  action,
  busy,
  settingsSaved,
  error,
}: {
  data: PayAdminOverview;
  settings: PaySettings;
  update: (patch: Partial<PaySettings>) => void;
  action: (url: string, body: unknown) => Promise<void>;
  busy: boolean;
  settingsSaved: boolean;
  error: string;
}) {
  const [feeError, setFeeError] = useState("");
  useEffect(() => {
    const target = location.hash.slice(1);
    if (target.startsWith("pay-") || target === "sms-forwarder-guide-title") {
      document.getElementById(target)?.scrollIntoView();
    }
  }, []);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeeError("");
    const fields = new FormData(event.currentTarget);
    try {
      const fee = readFeeFields(fields, "collection-fee");
      const rails = settings.rails.map(rail => ({
        ...rail, fees: { currency: rail.fees?.currency ?? "IRR", ...readFeeFields(fields, `fee-${rail.id}`) },
      }));
      void action("/api/admin/mobocom-pay/settings", {
        ...settings, rails, feeBps: fee.bps, flatFeeRial: fee.flat, feeCapRial: fee.cap,
        settingsRevision: data.settingsRevision,
      });
    } catch (failure) {
      setFeeError(failure instanceof Error ? failure.message : "مقادیر کارمزد را بررسی کنید.");
    }
  }
  return (
    <div className={layout.workspace}>
    <section className={`${layout.panel} ${layout.settingsIndex}`} aria-labelledby="pay-settings-index">
      <div className={layout.sectionHead}><div><h2 id="pay-settings-index">پیکربندی درگاه</h2><p>تنظیمات دریافت و تسویه با هم ذخیره می‌شوند. هر منبع پیامک دکمهٔ ذخیرهٔ خودش را دارد.</p></div></div>
      <div className={layout.guideIndex}>
        <a className={layout.guideLink} href="#pay-receive-settings">دریافت و کارمزد</a>
        <a className={layout.guideLink} href="#pay-sms-policy">سیاست تطبیق پیامک</a>
        <a className={layout.guideLink} href="#pay-settlement-settings">مسیرهای تسویه</a>
        <a className={layout.guideLink} href="#pay-sms-sources">منابع پیامک</a>
        <a className={layout.guideLink} href="#pay-admin-guide">راهنمای مدیریت</a>
      </div>
    </section>
    <section id="pay-receive-settings" className={`${s.card} ${s.stack}`}>
      <h2>تنظیمات دریافت و تسویه</h2>
      <form className={s.stack} key={data.settingsRevision} onSubmit={save} onChange={() => setFeeError("")}>
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
      <fieldset className={feeStyle.group}>
        <legend>مهلت فاکتورهای موبوکام‌پی</legend>
        <Field label="مهلت پرداخت هر فاکتور (دقیقه)"><input type="number" dir="ltr" min={5} max={120} list="pay-invoice-minutes" value={settings.paymentMinutes} onChange={event => { if (event.target.value) update({ paymentMinutes: Number(event.target.value) }) }} required /></Field>
        <datalist id="pay-invoice-minutes"><option value="30" /><option value="60" /></datalist>
        <p className={s.muted}>از صدور لینک تا پایان فرصت واریز. تغییر مهلت روی فاکتورهای تازه اعمال می‌شود.</p>
      </fieldset>
      <fieldset className={feeStyle.group}>
        <legend>کارمزد پیش‌فرض دریافت</legend>
        <p className={s.muted}>کارمزد برابر درصد مبلغ سفارش به‌علاوهٔ مبلغ ثابت است و حداکثر تا سقف تعیین‌شده محاسبه می‌شود.</p>
        <FeeFields name="collection-fee" values={{ bps: settings.feeBps, flat: settings.flatFeeRial, cap: settings.feeCapRial }} />
      </fieldset>
      <div className={s.grid}>
        {(
          [
            ["minPaymentRial", "حداقل پرداخت ریال"],
            ["maxPaymentRial", "حداکثر پرداخت ریال"],
            ["minSettlementRial", "حداقل تسویه ریال"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              dir="ltr"
              inputMode="numeric"
              value={settings[key]}
              onChange={(e) => {
                const v = e.target.value;
                update({ [key]: v });
              }}
            />
          </Field>
        ))}
      </div>
 <fieldset id="pay-sms-policy" className={`${s.stack} ${feeStyle.group}`}>
 <legend>کارت‌به‌کارت هوشمند</legend>
 <label className={s.check}><input type="checkbox" checked={settings.bale.enabled} onChange={(e) => update({ bale: { ...settings.bale, enabled: e.target.checked } })} /> مبلغ یکتای کارت‌به‌کارت و تأیید خودکار با پیامک</label>
 <p className={s.muted}>با فعال کردن این گزینه، مبلغ واریز هر فاکتور کارت‌به‌کارت تازه یکتا می‌شود. اگر حساب اختصاصی تعیین نشده باشد، کارت‌به‌کارت از حساب عمومی فعال استفاده می‌کند. رسید در هر حالت لازم است و بدون منبع معتبر پیامک، مدیر آن را دستی تأیید می‌کند.</p>
 <div className={layout.guideIndex}><Link className={layout.guideLink} href="/admin/gateways">تنظیم حساب مقصد درگاه</Link><a className={layout.guideLink} href="#pay-sms-sources">مدیریت منبع پیامک</a></div>
 <details className={feeStyle.progressive}>
 <summary>بازهٔ مبلغ تشخیص و تنظیمات سایر فاکتورهای سایت</summary>
 <div className={s.grid}>
 <Field label="حداقل مبلغ تشخیص (ریال)"><input dir="ltr" inputMode="numeric" value={settings.bale.minAdjustmentRial} onChange={(e) => update({ bale: { ...settings.bale, minAdjustmentRial: latinDigits(e.target.value) } })} /></Field>
 <Field label="حداکثر مبلغ افزوده به واریز (ریال)"><input dir="ltr" inputMode="numeric" value={settings.bale.maxAdjustmentRial} onChange={(e) => update({ bale: { ...settings.bale, maxAdjustmentRial: latinDigits(e.target.value) } })} /></Field>
 <Field label="مهلت فاکتورهای خارج از پنل پذیرندگان (دقیقه)"><input dir="ltr" type="number" min={5} max={120} value={settings.bale.minutes} onChange={(e) => { const value = e.target.value; if (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))) update({ bale: { ...settings.bale, minutes: Number(value) } }) }} /></Field>
 </div>
 <p className={s.muted}>حدها باید مضرب ۱۰ ریال باشند. اگر مبلغ فاکتور مضرب ۱۰ نباشد، تا ۹ ریال گردکردن جداگانه در مبلغ نهایی لحاظ می‌شود.</p>
 </details>
 </fieldset>
      <h3 id="pay-settlement-settings">مسیرهای تسویه</h3>
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
          </div>
          <FeeFields name={`fee-${r.id}`} currency={r.fees?.currency} values={r.fees ?? { bps: 0, flat: r.feeRial, cap: "0" }} />
        </fieldset>
      ))}
      <div className={s.actions}>
        <button
          type="submit"
          className={`${s.button} ${layout.primaryAction}`}
          disabled={busy}
        >
          {busy ? "در حال ذخیره…" : "ذخیره تنظیمات"}
        </button>
        {settingsSaved && <p role="status" className={layout.saveState}>تنظیمات دریافت و تسویه ذخیره شد.</p>}
        {!settingsSaved && error && <p className={layout.saveState}>{error}</p>}
      </div>
      <ErrorNotice error={feeError} />
      </form>
    </section>
    <section id="pay-sms-sources" aria-label="پیکربندی منابع دریافت">
      <div className={layout.guideIndex}>
        <Link className={layout.guideLink} href="/admin/gateways">تنظیم حساب مقصد</Link>
        <a className={layout.guideLink} href="#sms-forwarder-guide-title">راهنمای SMS Forwarder</a>
      </div>
      <SmsSources bankAccounts={data.bankAccounts} />
    </section>
    <OperatorGuide />
    </div>
  );
}
