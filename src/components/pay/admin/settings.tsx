"use client";
import type {
  PayAdminOverview,
  PaySettings,
} from "@/modules/billing/domain/pay";
import { Field } from "../shared";
import s from "../Pay.module.css";
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
            </span>
            <input
              type="checkbox"
              checked={settings.bankAccountIds.includes(a.id)}
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
      <h3>مسیرهای تسویه</h3>
      {settings.rails.map((r, index) => (
        <fieldset key={r.id}>
          <legend>
            {r.asset} · {r.network}
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
            {(["rialPerUnit", "feeRial"] as const).map((key) => (
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
  );
}
