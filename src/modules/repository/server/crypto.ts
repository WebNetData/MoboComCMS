import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, type KeyObject } from 'node:crypto'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { canonicalJson, licenseKeyFromBytes } from '@/modules/repository/domain/repository'

export const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')
export const newLicenseKey = () => licenseKeyFromBytes(randomBytes(24))
export const fingerprintOf = (publicPem: string) => sha256(publicPem.trim()).slice(0, 32).toUpperCase().replace(/(.{4})(?=.)/g, '$1-')

const KEY = 'repository.signing.v1'
let cached: { privateKey: KeyObject; publicPem: string } | null = null

/**
 * The repository's signing key (Ed25519). REPOSITORY_SIGNING_KEY (base64 of a PKCS#8 PEM) wins;
 * otherwise a key is generated once and kept encrypted in the settings. Sites pin its public half.
 */
export async function vendorKeys(): Promise<{ privateKey: KeyObject; publicPem: string }> {
  if (cached) return cached
  const fromEnv = String(process.env.REPOSITORY_SIGNING_KEY || '').trim()
  if (fromEnv) {
    const privateKey = createPrivateKey(Buffer.from(fromEnv, 'base64').toString('utf8'))
    cached = { privateKey, publicPem: createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString() }
    return cached
  }
  const stored = await readJsonSetting(KEY)
  if (stored && typeof stored.privateEnc === 'string' && typeof stored.publicPem === 'string') {
    cached = { privateKey: createPrivateKey(decryptPanelCredential(stored.privateEnc)), publicPem: stored.publicPem }
    return cached
  }
  const pair = generateKeyPairSync('ed25519')
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  await writeJsonSetting(KEY, { privateEnc: encryptPanelCredential(privatePem), publicPem, createdAt: new Date().toISOString() })
  cached = { privateKey: pair.privateKey, publicPem }
  return cached
}

export async function signPayload(payload: unknown): Promise<string> {
  const { privateKey } = await vendorKeys()
  return sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString('base64url')
}

export function verifyPayload(payload: unknown, signature: string, publicPem: string): boolean {
  try { return verify(null, Buffer.from(canonicalJson(payload)), createPublicKey(publicPem), Buffer.from(signature, 'base64url')) } catch { return false }
}
