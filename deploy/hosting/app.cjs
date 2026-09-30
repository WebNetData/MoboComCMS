'use strict'

/*
 * Startup file for shared hosting "Node.js App" (cPanel / DirectAdmin, Phusion Passenger).
 * Passenger starts this file and routes the site's traffic to it; the built app (.next) must
 * already be in place (it is built on another machine — see docs/DEPLOY-VPS-HOST-FA.md).
 *
 * Settings come from the panel's environment variables, or from storage/config/runtime.env
 * written by the web installer. Migrations are not run here: run `npm run deploy:migrate`
 * from the panel terminal after each upload.
 */
const path = require('node:path')
const http = require('node:http')

const root = path.resolve(__dirname, '..', '..')
process.chdir(root)
process.env.NODE_ENV = 'production'
process.env.NEXT_TELEMETRY_DISABLED = '1'
// Passenger stops idle apps, so the in-process scheduler is unreliable here: the panel's cron runs the jobs.
if (!process.env.BACKGROUND_JOBS) process.env.BACKGROUND_JOBS = 'false'

// Installer-saved settings (real environment variables win), the same allow-listed keys as scripts/load-runtime-env.cjs.
const KEYS = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'INTERNAL_JOBS_SECRET', 'PANEL_CREDENTIAL_KEY']
try {
  const fs = require('node:fs')
  const file = path.join(root, process.env.INSTALL_CONFIG_DIR || 'storage/config', 'runtime.env')
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match && KEYS.includes(match[1]) && !String(process.env[match[1]] || '').trim()) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2')
  }
} catch { /* no installer settings */ }

const next = require('next')
const app = next({ dev: false, dir: root })
const handle = app.getRequestHandler()
app.prepare().then(() => {
  // Passenger replaces the port; PORT is used when this file is run by hand for a test.
  http.createServer((req, res) => handle(req, res)).listen(Number(process.env.PORT || 3000), () => {
    console.log('[mobocom] ready')
  })
}).catch((error) => {
  console.error('[mobocom] failed to start:', error)
  process.exit(1)
})
