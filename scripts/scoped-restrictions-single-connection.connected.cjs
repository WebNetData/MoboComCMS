// Same actual handlers/actor/concurrency suite with a one-connection pool, not a mocked transaction.
const { spawnSync } = require('node:child_process'), path = require('node:path')
const result = spawnSync(process.execPath, [path.join(__dirname, 'scoped-restrictions.connected.cjs'), '--single-connection'], { env: process.env, stdio: 'inherit' })
process.exit(result.status ?? 1)
