// First-run capability, stored beside the existing installer runtime environment.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const dir = path.resolve(process.env.INSTALL_CONFIG_DIR || 'storage/config')
if (process.env.INSTALL_DISABLED !== 'true' && !fs.existsSync(path.join(dir, 'installed.lock')) && !process.env.INSTALL_TOKEN?.trim()) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = path.join(dir, 'install.token')
  try {
    const token = crypto.randomBytes(32).toString('hex')
    fs.writeFileSync(file, token + '\n', { flag: 'wx', mode: 0o600 })
    console.log('[install] First-run installation code: ' + token)
    console.log('[install] Keep this code private; /install closes after the first owner is created.')
  } catch (error) { if (error.code !== 'EEXIST') throw error }
}
