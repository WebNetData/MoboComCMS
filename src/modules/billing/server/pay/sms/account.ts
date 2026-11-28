import { latinDigits } from '@/shared/text/digits'

export function smsAccountDigits(value: string) {
  const digits = latinDigits(value).replace(/[^0-9]/g, '')
  return /^[0-9]{5,30}$/.test(digits) ? digits : ''
}

export function matchesSmsAccount(account: string, reported: string) {
  const digits = smsAccountDigits(account)
  return Boolean(digits && /^[0-9]{5,30}$/.test(reported) && digits.endsWith(reported))
}
