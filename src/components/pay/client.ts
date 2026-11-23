export const money = (value: string) => {
  try {
    return `${BigInt(value).toLocaleString("fa-IR")} ریال`;
  } catch {
    return `${value} ریال`;
  }
};
export const date = (value: string) => new Date(value).toLocaleString("fa-IR");
export const labels: Record<string, string> = {
  PENDING: "در انتظار",
  ACTIVE: "فعال",
  SUSPENDED: "تعلیق شده",
  PAID: "پرداخت شده",
  EXPIRED: "منقضی",
  REQUESTED: "درخواست شده",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
  UNMATCHED: "تطبیق نیافته",
  MATCHED: "تطبیق یافته",
};
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok || !body.ok)
    throw new Error(body.error || "دریافت اطلاعات ناموفق بود");
  return body.data as T;
}
export const json = (
  method: string,
  data: unknown,
  key?: string,
): RequestInit => ({
  method,
  headers: {
    "Content-Type": "application/json",
    ...(key ? { "Idempotency-Key": key } : {}),
  },
  body: JSON.stringify(data),
});
