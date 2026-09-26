import crypto from 'node:crypto'

const PREFIX = 'encv1:'

function keyBytes(): Buffer | null {
  const raw = String(process.env.PANEL_CREDENTIAL_KEY || '').trim()
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('PANEL_CREDENTIAL_KEY is required in production')
    return null
  }
  if (!/^[0-9a-f]{64}$/i.test(raw)) throw new Error('PANEL_CREDENTIAL_KEY must be 64 hex characters')
  return Buffer.from(raw, 'hex')
}

/**
 * Encrypts provider credentials before they are persisted in Panel.token/password.
 * AES-256-GCM gives both confidentiality and tamper detection. Development keeps
 * plaintext compatibility when no key is configured so local fixtures stay easy.
 */
export function encryptPanelCredential(value: string): string {
  const plain = String(value || '')
  if (!plain || plain.startsWith(PREFIX)) return plain
  const key = keyBytes()
  if (!key) return plain

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

/** Existing plaintext rows remain readable so upgrades do not break old installs. */
export function decryptPanelCredential(value: string): string {
  const stored = String(value || '')
  if (!stored || !stored.startsWith(PREFIX)) return stored
  const key = keyBytes()
  if (!key) throw new Error('PANEL_CREDENTIAL_KEY is required to decrypt provider credentials')

  const payload = stored.slice(PREFIX.length)
  const [ivRaw, tagRaw, ciphertextRaw, extra] = payload.split('.')
  if (!ivRaw || !tagRaw || !ciphertextRaw || extra !== undefined) throw new Error('invalid encrypted panel credential')

  const iv = Buffer.from(ivRaw, 'base64url')
  const tag = Buffer.from(tagRaw, 'base64url')
  const ciphertext = Buffer.from(ciphertextRaw, 'base64url')
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) throw new Error('invalid encrypted panel credential')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export function maskPanelCredential(value: string): string {
  try {
    const plain = decryptPanelCredential(value)
    return plain ? `••••${plain.slice(-4)}` : ''
  } catch {
    return '••••ERR'
  }
}

export function hasPanelCredential(value: string): boolean {
  try { return Boolean(decryptPanelCredential(value)) } catch { return false }
}
