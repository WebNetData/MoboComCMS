import { HostingError } from '@/modules/hosting/domain/catalog'
export type CloudAutomation = {
  autoOperations: boolean
  image?: string
  location?: string
  node?: string
  templateVmid?: number
  vmidBase?: number
  cloudUser?: string
  jokerMaxPrice?: string
  jokerCurrency?: string
  nameservers?: string[]
}
export function cloudAutomation(raw: unknown, driver: string): CloudAutomation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HostingError('تنظیم عملیات معتبر نیست')
  const v = raw as Record<string, unknown>,
    allowed = [
      'autoOperations',
      'image',
      'location',
      'node',
      'templateVmid',
      'vmidBase',
      'cloudUser',
      'jokerMaxPrice',
      'jokerCurrency',
      'nameservers',
    ]
  if (Object.keys(v).some((k) => !allowed.includes(k)) || typeof v.autoOperations !== 'boolean')
    throw new HostingError('فیلد تنظیم عملیات معتبر نیست')
  const result: CloudAutomation = { autoOperations: v.autoOperations }
  const text = (key: string, max = 80) => {
    const value = String(v[key] ?? '').trim()
    if (value.length > max || /[\u0000-\u001f]/.test(value)) throw new HostingError('مقدار تنظیم عملیات معتبر نیست')
    return value
  }
  if (driver === 'HETZNER_CLOUD') {
    result.image = text('image')
    result.location = text('location')
    if (result.autoOperations && (!/^[a-zA-Z0-9._-]+$/.test(result.image) || !/^[a-zA-Z0-9_-]+$/.test(result.location)))
      throw new HostingError('تصویر سیستم‌عامل و مکان هتزنر لازم است')
  } else if (driver === 'PROXMOX') {
    result.node = text('node')
    result.templateVmid = Number(v.templateVmid)
    result.vmidBase = Number(v.vmidBase)
    result.cloudUser = text('cloudUser') || 'root'
    if (
      result.autoOperations &&
      (!/^[A-Za-z0-9_-]{1,64}$/.test(result.node) ||
        !Number.isSafeInteger(result.templateVmid) ||
        result.templateVmid < 100 ||
        !Number.isSafeInteger(result.vmidBase) ||
        result.vmidBase < 1000 ||
        result.vmidBase > 900000000 ||
        !/^[a-z][a-z0-9_-]{0,31}$/.test(result.cloudUser))
    )
      throw new HostingError('گره، شناسهٔ قالب Cloud-init، ابتدای بازهٔ اختصاصی VM و کاربر را تنظیم کنید')
  } else if (driver === 'JOKER') {
    result.jokerMaxPrice = text('jokerMaxPrice')
    result.jokerCurrency = text('jokerCurrency') || 'USD'
    result.nameservers = String(v.nameservers ?? '')
      .split(/[\s,،]+/)
      .filter(Boolean)
      .map((n) => n.toLowerCase())
    if (
      result.autoOperations &&
      (!/^\d{1,6}(\.\d{1,2})?$/.test(result.jokerMaxPrice) ||
        Number(result.jokerMaxPrice) <= 0 ||
        !['USD', 'EUR'].includes(result.jokerCurrency) ||
        result.nameservers.length < 2 ||
        result.nameservers.length > 6 ||
        result.nameservers.some((n) => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(n)))
    )
      throw new HostingError('سقف هزینه، ارز و حداقل دو نیم‌سرور معتبر Joker لازم است')
  } else if (driver !== 'CPANEL' && result.autoOperations) throw new HostingError('عملیات خودکار این سامانه آماده نیست')
  return result
}
