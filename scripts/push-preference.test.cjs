const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

test('account push respects active status and the member preference', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/push/server/push.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  let member = { status: 'ACTIVE', pushAlerts: false }
  let targetReads = 0
  let channelEnabled = true
  const db = {
    user: { async findUnique() { return member } },
    pushSubscription: { async findMany() { targetReads++; return [] } },
  }
  const mocks = {
    'web-push': { default: {} },
    '@/platform/database/prisma': { db },
    '@/platform/observability/logger': { logEvent: () => undefined },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/settings/server': { readJsonSetting: async () => ({ accountEvents: true }), writeJsonSetting: async () => undefined },
    '@/modules/providers/server/panel-credentials': { decryptPanelCredential: () => '', encryptPanelCredential: () => '' },
    '@/modules/notifications/server/preferences': { isNotificationChannelEnabled: async (userId, kind, channel) => {
      assert.equal(userId, 1)
      assert.equal(kind, 'ORDER_STATUS')
      assert.equal(channel, 'push')
      return channelEnabled
    } },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => mocks[name] || require(name), module, module.exports)
  const send = module.exports.pushToUser
  const payload = { title: 'Account notice', tag: 'ORDER_STATUS' }

  assert.deepEqual(await send(1, payload), { sent: 0, failed: 0 })
  assert.equal(targetReads, 0)
  member = { status: 'BANNED', pushAlerts: true }
  assert.deepEqual(await send(1, payload), { sent: 0, failed: 0 })
  assert.equal(targetReads, 0)
  member = { status: 'ACTIVE', pushAlerts: true }
  channelEnabled = false
  assert.deepEqual(await send(1, payload), { sent: 0, failed: 0 })
  assert.equal(targetReads, 0)
  channelEnabled = true
  assert.deepEqual(await send(1, payload), { sent: 0, failed: 0 })
  assert.equal(targetReads, 1)
})
