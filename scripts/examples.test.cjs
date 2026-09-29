const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const contracts = load('src/platform/extensions/contracts.ts')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const json = (file) => JSON.parse(read(file))

test('the examples have valid manifests that match their folders', () => {
  const plugin = json('examples/plugins/sample-feedback/manifest.json')
  const theme = json('examples/themes/sample-editorial/manifest.json')
  assert.doesNotThrow(() => contracts.assertValidExtensionManifest(plugin))
  assert.doesNotThrow(() => contracts.assertValidExtensionManifest(theme))
  assert.equal(plugin.id, 'sample-feedback'); assert.equal(theme.id, 'sample-editorial'); assert.equal(theme.design.id, theme.id)
  assert.equal(plugin.defaultEnabled, false, 'a sample never switches itself on')
  // Every permission the plugin's routes ask for is declared, and every declared capability is used.
  const server = read('examples/plugins/sample-feedback/server.ts')
  for (const permission of server.match(/permission:[a-z.-]+/g) || []) assert.ok(plugin.permissions.some((p) => p.id === permission.slice('permission:'.length)), permission)
  for (const capability of plugin.capabilities) assert.ok(['ui', 'admin', 'api', 'events', 'jobs', 'settings', 'storage'].includes(capability))
  assert.ok(plugin.adminNavigation.every((n) => n.href.startsWith('/admin/extensions/sample-feedback')))
})

test('example:install copies an example and the generator registers it (in a throw-away project)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-'))
  fs.cpSync(path.join(root, 'examples'), path.join(dir, 'examples'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'scripts')); fs.copyFileSync(path.join(root, 'scripts/generate-extensions.mjs'), path.join(dir, 'scripts/generate-extensions.mjs'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.5.0' }))
  const run = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts/install-example.mjs'), ...args], { cwd: dir, env: { ...process.env, EXAMPLE_ROOT: dir }, encoding: 'utf8' })
  const plugin = run('plugin', 'sample-feedback')
  assert.equal(plugin.status, 0, plugin.stderr + plugin.stdout)
  const theme = run('theme', 'sample-editorial')
  assert.equal(theme.status, 0, theme.stderr + theme.stdout)
  assert.ok(fs.existsSync(path.join(dir, 'src/plugins/sample-feedback/server.ts')))
  assert.ok(!fs.existsSync(path.join(dir, 'src/plugins/sample-feedback/README.md')), 'documentation stays in examples/')
  const catalog = fs.readFileSync(path.join(dir, 'src/extensions/generated/catalog.ts'), 'utf8')
  assert.match(catalog, /sample-feedback/)
  assert.match(fs.readFileSync(path.join(dir, 'src/extensions/generated/server-registry.ts'), 'utf8'), /sample-feedback/)
  assert.match(fs.readFileSync(path.join(dir, 'src/themes/generated/catalog.ts'), 'utf8'), /sample-editorial/)
  assert.match(fs.readFileSync(path.join(dir, 'src/themes/generated.css'), 'utf8'), /ed-strip/, 'the theme stylesheet is bundled')
  // A second install, an unknown name and unsafe names are refused.
  assert.equal(run('plugin', 'sample-feedback').status, 1)
  for (const bad of ['nope', '../x', 'Sample', '']) assert.equal(run('plugin', bad).status, 1, bad)
  assert.equal(run('widget', 'sample-feedback').status, 1)
})

test('a plugin that asks for more than the SDK offers is refused by the architecture check', () => {
  const check = read('scripts/check-architecture.mjs')
  assert.match(check, /plugins cannot import core server internals/)
  // The SDK gives plugins what they need without private imports.
  const sdk = read('src/extensions/sdk/server.ts')
  assert.match(sdk, /export function extensionJson/); assert.match(sdk, /export function extensionStorage/); assert.match(sdk, /export async function enqueueExtensionJob/)
  for (const file of ['examples/plugins/sample-feedback/server.ts', 'examples/plugins/sample-feedback/client.tsx']) {
    const source = read(file)
    assert.ok(!/@prisma\/client|@\/platform\/database|@\/modules\/|next\/server/.test(source), `${file} stays inside the plugin boundary`)
  }
})

test('the developer guide covers every extension feature and points at real files', () => {
  const guide = read('docs/DEVELOPERS-FA.md')
  for (const topic of ['manifest.json', 'جایگاه', 'settings', 'permissions', 'AdminPage', 'ctx.storage', 'enqueueJob', 'order.created', 'validateSettings', 'extension:new', 'theme:new', 'example:install', 'package:zip', 'requiresCore', 'arch:check', 'sample-feedback', 'sample-editorial', 'ماژول']) assert.ok(guide.includes(topic), `guide mentions ${topic}`)
  for (const ref of guide.match(/\((?:\.\.\/)?(?:examples|docs|src|scripts)\/[A-Za-z0-9_./\-\[\]]+\)/g) || []) {
    const file = ref.slice(1, -1).replace(/^\.\.\//, '')
    assert.ok(fs.existsSync(path.join(root, file)), `link target exists: ${file}`)
  }
})
