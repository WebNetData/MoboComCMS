import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { compatibilityIssue, isCompatibilityRange } from '../src/platform/extensions/compatibility.ts'

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
try {
 const manifest = JSON.parse(fs.readFileSync(path.join(from, 'manifest.json'), 'utf8'))
 const core = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
 const caps = new Set(['ui', 'admin', 'api', 'events', 'jobs', 'settings', 'storage'])
 const record = value => !!value && typeof value === 'object' && !Array.isArray(value)
 if (manifest.id !== name || manifest.kind !== kind || manifest.apiVersion !== 1) throw new Error('Invalid example id, kind or API version')
 if (typeof core !== 'string' || !isCompatibilityRange(core) || core.startsWith('^')) throw new Error('Invalid target core version')
 if (manifest.requiresCore !== undefined && !isCompatibilityRange(manifest.requiresCore)) throw new Error('Invalid requiresCore')
 if (manifest.requires !== undefined && (!Array.isArray(manifest.requires) || manifest.requires.length > 100 || !manifest.requires.every(id => typeof id === 'string' && id.length <= 50 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)))) throw new Error('Invalid requires')
 if (manifest.dependencyVersions !== undefined && (!record(manifest.dependencyVersions) || Object.keys(manifest.dependencyVersions).length > 100 || !Object.entries(manifest.dependencyVersions).every(([id, range]) => manifest.requires?.includes(id) && isCompatibilityRange(range)))) throw new Error('Invalid dependencyVersions')
 if (manifest.requiresCapabilities !== undefined && (!record(manifest.requiresCapabilities) || Object.keys(manifest.requiresCapabilities).length > 100 || !Object.entries(manifest.requiresCapabilities).every(([id, values]) => manifest.requires?.includes(id) && Array.isArray(values) && values.length <= caps.size && values.every(value => caps.has(value))))) throw new Error('Invalid requiresCapabilities')
 const dir = path.join(root, 'src/plugins')
 const catalog = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
   const file = path.join(dir, entry.name, 'manifest.json')
   return fs.existsSync(file) ? [JSON.parse(fs.readFileSync(file, 'utf8'))] : []
 }) : []
 const issue = compatibilityIssue(manifest, catalog, core)
 if (issue) throw new Error(issue)
} catch (error) {
 console.error(`Example compatibility validation failed: ${error.message}`)
 process.exit(1)
}
fs.mkdirSync(path.dirname(to), { recursive: true })
const realRoot = fs.realpathSync(root), realParent = fs.realpathSync(path.dirname(to))
const relativeParent = path.relative(realRoot, realParent)
if (relativeParent === '..' || relativeParent.startsWith(`..${path.sep}`) || path.isAbsolute(relativeParent)) { console.error('Install destination is outside the project'); process.exit(1) }
fs.mkdirSync(to)
const created = fs.lstatSync(to)
fs.cpSync(from, to, { recursive: true, filter: (source) => !/README\.md$/i.test(source) })
console.log(`Installed ${map[kind][1]}/${name}`)
if (process.env.EXAMPLE_SKIP_GENERATE !== '1') {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/generate-extensions.mjs')], { cwd: root, stdio: 'inherit' })
 if (result.status !== 0) {
   const current = fs.lstatSync(to, { throwIfNoEntry: false })
   if (current?.isDirectory() && !current.isSymbolicLink() && current.dev === created.dev && current.ino === created.ino && fs.realpathSync(path.dirname(to)) === realParent && fs.realpathSync(to) === path.join(realParent, name)) fs.rmSync(to, { recursive: true })
   else console.error(`Could not safely remove failed install: ${to}`)
   process.exit(result.status || 1)
 }
}
console.log('Done. Restart `npm run dev`, then enable it in the admin (plugins: Extensions; themes: Site Studio).')
