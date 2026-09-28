// TOTP (RFC 6238) building blocks shared by the server panel and account 2-step sign-in.
// Pure: the HMAC itself is computed by the caller (see totp-verify.ts).

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  const out: number[] = []
  let bits = 0, value = 0
  for (const char of clean) {
    const index = B32.indexOf(char)
    if (index < 0) throw new Error('invalid base32')
    value = (value << 5) | index; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Uint8Array.from(out)
}

/** HOTP truncation given an HMAC-SHA1 digest (the caller computes the HMAC). */
export function hotpFromDigest(digest: Uint8Array, digits = 6): string {
  const offset = digest[digest.length - 1] & 0x0f
  const code = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(code % 10 ** digits).padStart(digits, '0')
}

/** 8-byte big-endian counter for a time step. */
export function totpCounter(now: number, step = 30): Uint8Array {
  let counter = Math.floor(now / 1000 / step)
  const buffer = new Uint8Array(8)
  for (let i = 7; i >= 0; i--) { buffer[i] = counter & 0xff; counter = Math.floor(counter / 256) }
  return buffer
}

export const totpUri = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
