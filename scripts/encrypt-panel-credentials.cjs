'use strict'

const crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client')

const PREFIX = 'encv1:'
const rawKey = String(process.env.PANEL_CREDENTIAL_KEY || '').trim()
if (!/^[0-9a-f]{64}$/i.test(rawKey)) {
  console.error('[panel-credentials] PANEL_CREDENTIAL_KEY must be 64 hex chars')
  process.exit(2)
}
const key = Buffer.from(rawKey, 'hex')

function encrypt(value) {
  const plain = String(value || '')
  if (!plain || plain.startsWith(PREFIX)) return plain
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

async function main() {
  const db = new PrismaClient()
  try {
    const panels = await db.panel.findMany({ select: { id: true, token: true, password: true } })
    let changed = 0
    for (const panel of panels) {
      const token = encrypt(panel.token)
      const password = encrypt(panel.password)
      if (token === panel.token && password === panel.password) continue
      await db.panel.update({ where: { id: panel.id }, data: { token, password } })
      changed += 1
    }
    console.log(`[panel-credentials] encrypted ${changed} panel credential record(s)`) 
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error('[panel-credentials]', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
