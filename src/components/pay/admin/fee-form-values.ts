import { latinDigits } from "@/shared/text/digits";

export function readFeeFields(data: FormData, name: string) {
  const value = (field: string) => latinDigits(data.get(`${name}.${field}`)).trim().replace("٫", ".");
  const percent = value("percent");
  if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(percent)) throw new Error("درصد کارمزد را از ۰ تا ۳۰، با حداکثر دو رقم اعشار وارد کنید.");
  const [whole, fraction = ""] = percent.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (bps > 3000) throw new Error("حداکثر درصد کارمزد ۳۰٪ است.");
  return { bps, flat: value("flat"), cap: value("cap") };
}
