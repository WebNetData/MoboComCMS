import { kindMeta } from '@/modules/hosting/domain/catalog'

export const fa = (n: number) => n.toLocaleString('fa-IR')
export const day = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'long', day: 'numeric' })
export const moment = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null)
export const kindIcon = (kind: string) => (kind === 'CLOUD_SERVER' || kind === 'CLOUD_HOSTING' ? 'cloud' : kindMeta(kind)?.group === 'servers' ? 'server' : 'globe')
