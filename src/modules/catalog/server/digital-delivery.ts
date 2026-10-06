import crypto from 'node:crypto'

const prefix = 'store:v1:'

function key() {
  const raw = String(process.env.STORE_DELIVERY_KEY || process.env.PANEL_CREDENTIAL_KEY || '').trim()
  if (!/^[0-9a-f]{64}$/i.test(raw)) throw Error('STORE_DELIVERY_KEY or PANEL_CREDENTIAL_KEY must be configured as 64 hex characters before storing digital delivery details')
  return Buffer.from(raw, 'hex')
}

export function encryptDigitalDelivery(value: string) {
  const text = value.trim()
  if (!text) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return prefix + [iv, cipher.getAuthTag(), bytes].map(part => part.toString('base64url')).join('.')
}

export function decryptDigitalDelivery(value: string) {
  if (!value) return ''
  if (!value.startsWith(prefix)) throw Error('Invalid encrypted delivery details')
  const [ivRaw, tagRaw, encryptedRaw] = value.slice(prefix.length).split('.')
  if (!ivRaw || !tagRaw || !encryptedRaw) throw Error('Invalid encrypted delivery details')
  const iv = Buffer.from(ivRaw, 'base64url')
  const tag = Buffer.from(tagRaw, 'base64url')
  const encrypted = Buffer.from(encryptedRaw, 'base64url')
  if (iv.length !== 12 || tag.length !== 16) throw Error('Invalid encrypted delivery details')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

/** Keyed hash of a secret, to recognise the same secret again without storing it readable. */
export function digitalFingerprint(value: string) {
  return crypto.createHmac('sha256', key()).update(value.trim(), 'utf8').digest('hex')
}
