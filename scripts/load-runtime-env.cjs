'use strict'
// Prints `export` lines for the settings the web installer saved (storage/config/runtime.env), for the container
// start script: eval "$(node scripts/load-runtime-env.cjs)". Real environment variables always win, only the
// allow-listed keys are read, and values are single-quoted so nothing in the file can run as shell code.
const fs = require('node:fs')
const path = require('node:path')

const KEYS = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'INTERNAL_JOBS_SECRET', 'PANEL_CREDENTIAL_KEY']
const SAFE = /^[A-Za-z0-9_@:/?&=.%+,#~!*()-]+$/
const file = path.join(path.resolve(process.env.INSTALL_CONFIG_DIR || path.join(process.cwd(), 'storage', 'config')), 'runtime.env')

function parse(text) {
  const out = {}
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line)
    if (!match || !KEYS.includes(match[1])) continue
    let value = match[2].trim()
    if (value.length >= 2 && ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))) value = value.slice(1, -1)
    if (value && SAFE.test(value)) out[match[1]] = value
  }
  return out
}

if (fs.existsSync(file)) {
  const values = parse(fs.readFileSync(file, 'utf8'))
  const loaded = []
  for (const key of KEYS) {
    if (!values[key] || String(process.env[key] || '').trim()) continue
    console.log(`export ${key}='${values[key].replace(/'/g, `'\\''`)}'`)
    loaded.push(key)
  }
  console.log(`INSTALLER_LOADED_KEYS='${loaded.join(' ')}'`)
}
module.exports = { parse, KEYS }
