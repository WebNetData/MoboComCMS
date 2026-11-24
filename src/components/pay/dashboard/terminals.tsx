"use client";
import type { PayOverview } from "@/modules/billing/domain/pay";
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
  return (
    <><div className={s.split}>
      <section className={s.card}>
        <h2>پایانه‌ها</h2>
        {data.terminals.length ? (
          data.terminals.map((t) => (
            <div className={s.row} key={t.id}>
              <div>
                <strong>{t.name}</strong>
                <small className={s.ltr}>{t.returnUrl}</small>
              </div>
              <button
                type="button"
                className={s.secondary}
                disabled={busy || !active}
                onClick={() =>
                  action(() =>
                    api(
                      "/api/pay/terminals",
                      json("PATCH", { id: t.id, active: !t.active }),
                    ),
                  )
                }
              >
                {t.active ? "غیرفعال کردن" : "فعال کردن"}
              </button>
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
              json("POST", { name: terminalName, returnUrl }),
            );
            setTerminalName("");
            setReturnUrl("");
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
        <Field label="نشانی بازگشت">
          <input
            type="url"
            dir="ltr"
            value={returnUrl}
            onChange={(e) => setReturnUrl(e.target.value)}
          />
        </Field>
        <div>
          <button
            type="submit"
            className={s.button}
            disabled={busy || !active || !terminalName || !returnUrl}
          >
            ثبت پایانه
          </button>
        </div>
      </form>
    </div><BotIntegration data={data} /></>
  );
}
