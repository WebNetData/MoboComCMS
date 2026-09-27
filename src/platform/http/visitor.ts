import { createHash } from 'node:crypto'
import { authSecret } from '@/platform/config/env'
import { clientIp } from '@/platform/http/rate-limit'
import { tehranDay } from '@/shared/time/day'

/**
 * Anonymous visitor id: a salted hash of IP + user agent that changes every
 * day. It counts unique visitors and applies per-visitor limits without
 * storing IP addresses or setting cookies.
 */
export function visitorHash(headers: Headers, day = tehranDay()): string {
  const ua = (headers.get('user-agent') || '').slice(0, 300)
  return createHash('sha256').update(`${authSecret()}|visitor|${day}|${clientIp(headers)}|${ua}`).digest('hex').slice(0, 20)
}
