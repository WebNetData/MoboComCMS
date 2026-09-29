'use client'

import { createContext, useContext } from 'react'

export type SellerAccount = {
  id: number; slug: string; shopName: string; legalName: string; kind: string; nationalId: string; phone: string; email: string; city: string; address: string
  about: string; logo: string; banner: string; iban: string; ibanOwner: string; status: string; statusNote: string; commissionPercent: number | null; ratingCount: number; salesCount: number
}

export const SellerContext = createContext<{ seller: SellerAccount; reload: () => void } | null>(null)

export function useSeller() {
  const value = useContext(SellerContext)
  if (!value) throw new Error('useSeller outside the seller panel')
  return value
}

export const toman = (value: number) => `${Math.round(value).toLocaleString('fa-IR')} تومان`
export const faNum = (value: number) => value.toLocaleString('fa-IR')
export const faDate = (value: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date(value))

export async function call<T = unknown>(url: string, method: 'POST' | 'PUT' | 'PATCH', body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => null)
    return response.ok ? { ok: true, data: data as T } : { ok: false, error: String(data?.error || 'انجام نشد') }
  } catch { return { ok: false, error: 'ارتباط با سرور برقرار نشد' } }
}
