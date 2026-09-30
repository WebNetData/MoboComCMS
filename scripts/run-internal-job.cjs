'use strict'

const kind = process.argv[2]
const paths = {
  fulfillment: '/api/internal/fulfillment/run?limit=50',
  reminders: '/api/internal/reminders/run',
  engage: '/api/internal/engage/run',
  'store-marketing': '/api/internal/store-marketing/run',
  // Background queue (bulk import slices and other heavy admin work) and stalled-import recovery.
  imports: '/api/internal/imports/run',
}
const path = paths[kind]
if (!path) {
  console.error(`usage: node scripts/run-internal-job.cjs ${Object.keys(paths).join('|')}`)
  process.exit(2)
}

const secret = String(process.env.INTERNAL_JOBS_SECRET || '').trim()
if (!secret) {
  console.error('INTERNAL_JOBS_SECRET is missing')
  process.exit(2)
}

const origin = String(process.env.INTERNAL_APP_ORIGIN || 'http://127.0.0.1:3000').replace(/\/+$/, '')
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 120_000)

fetch(origin + path, {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
  signal: controller.signal,
}).then(async (res) => {
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`)
  console.log(text)
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}).finally(() => clearTimeout(timer))
