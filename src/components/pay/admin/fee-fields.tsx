import styles from "./FeeFields.module.css";

type FeeValues = { bps: number; flat: string; cap: string };
type FeeCurrency = "IRR" | "USDT";

export default function FeeFields({ name, values, currency = "IRR" }: {
  name: string;
  values: FeeValues;
  currency?: FeeCurrency;
}) {
  const unit = currency === "IRR" ? "ریال" : "USDT";
  const fields = [
    { name: "percent", label: "درصد کارمزد", value: String(values.bps / 100), unit: "٪", mode: "decimal" as const, hint: "مثلاً ۱٫۲۵ برای یک و بیست‌وپنج صدم درصد" },
    { name: "flat", label: "مبلغ ثابت کارمزد", value: values.flat, unit, mode: currency === "IRR" ? "numeric" as const : "decimal" as const, hint: "برای هر تراکنش؛ برای حذف، ۰ وارد کنید" },
    { name: "cap", label: "حداکثر سقف کارمزد", value: values.cap, unit, mode: currency === "IRR" ? "numeric" as const : "decimal" as const, hint: "سقف مجموع درصد و مبلغ ثابت؛ ۰ یعنی بدون سقف" },
  ];
  return <div className={styles.fields}>
    {fields.map(field => <div key={field.name} className={styles.field}>
      <label htmlFor={`${name}-${field.name}`}>{field.label} <span className={styles.srOnly}>({field.unit})</span></label>
      <div className={styles.amount}>
        <input id={`${name}-${field.name}`} name={`${name}.${field.name}`} defaultValue={field.value} inputMode={field.mode} dir="ltr" maxLength={field.name === "percent" ? 5 : 26} aria-describedby={`${name}-${field.name}-help`} required />
        <span aria-hidden="true">{field.unit}</span>
      </div>
      <small id={`${name}-${field.name}-help`}>{field.hint}</small>
    </div>)}
  </div>;
}
