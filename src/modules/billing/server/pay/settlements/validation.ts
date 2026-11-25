import { createHash } from 'node:crypto'
import { PayError } from '@/modules/billing/domain/pay'
import { text } from '@/modules/billing/domain/pay-policy'
import { cleanSheba, validSheba } from '@/modules/billing/domain/card-transfer'

function validTron(value: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return false
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let n = 0n
  for (const char of value) n = n * 58n + BigInt(alphabet.indexOf(char))
  let hex = n.toString(16)
  if (hex.length % 2) hex = '0' + hex
  const bytes = Buffer.from(hex, 'hex')
  if (bytes.length !== 25 || bytes[0] !== 0x41) return false
  const checksum = createHash('sha256')
    .update(createHash('sha256').update(bytes.subarray(0, 21)).digest())
    .digest()
    .subarray(0, 4)
  return checksum.equals(bytes.subarray(21))
}
export function normalizeSettlementDestination(asset: string, network: string, input: unknown) {
  const value = text(input, 150)
  if (asset === 'IRR') {
    if (!validSheba(value)) throw new PayError('شمارهٔ شبای معتبر لازم است')
    return cleanSheba(value)
  }
  if (network === 'BSC' || network === 'ETHEREUM') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) throw new PayError('آدرس EVM معتبر لازم است')
    return value.toLowerCase()
  }
  if (!validTron(value)) throw new PayError('آدرس شبکهٔ TRON معتبر نیست')
  return value
}
