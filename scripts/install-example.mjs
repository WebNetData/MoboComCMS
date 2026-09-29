import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// npm run example:install -- plugin sample-feedback | theme sample-editorial
// Copies an example from examples/ into the code base and regenerates the registries.
// EXAMPLE_ROOT points at another project root (used by the tests); EXAMPLE_SKIP_GENERATE=1 skips the generator.
const [kind, name] = process.argv.slice(2)
const map = { plugin: ['examples/plugins', 'src/plugins'], theme: ['examples/themes', 'src/themes/code'] }
if (!map[kind] || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(name || ''))) {
  console.error('Usage: npm run example:install -- plugin|theme <name>')
  console.error(`Available: ${['plugin', 'theme'].map((k) => `${k}: ${fs.existsSync(path.join(process.cwd(), map[k][0])) ? fs.readdirSync(path.join(process.cwd(), map[k][0])).filter((d) => !d.startsWith('.')).join(', ') : '-'}`).join(' | ')}`)
  process.exit(1)
}
const root = path.resolve(process.env.EXAMPLE_ROOT || process.cwd())
const from = path.join(root, map[kind][0], name)
const to = path.join(root, map[kind][1], name)
if (!fs.existsSync(path.join(from, 'manifest.json'))) { console.error(`No such example: ${map[kind][0]}/${name}`); process.exit(1) }
if (fs.existsSync(to)) { console.error(`Already installed: ${map[kind][1]}/${name}`); process.exit(1) }
fs.mkdirSync(path.dirname(to), { recursive: true })
fs.cpSync(from, to, { recursive: true, filter: (source) => !/README\.md$/i.test(source) })
console.log(`Installed ${map[kind][1]}/${name}`)
if (process.env.EXAMPLE_SKIP_GENERATE !== '1') {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/generate-extensions.mjs')], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}
console.log('Done. Restart `npm run dev`, then enable it in the admin (plugins: Extensions; themes: Site Studio).')
