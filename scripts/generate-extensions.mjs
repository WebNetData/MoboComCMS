import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const pluginsDir = path.join(root, 'src/plugins')
const themesDir = path.join(root, 'src/themes/code')
const extensionOut = path.join(root, 'src/extensions/generated')
const themeOut = path.join(root, 'src/themes/generated')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const coreVersion = String(pkg.version || '0.0.0')
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-+].+)?$/
function versionTuple(value) { const m = String(value).match(SEMVER); if (!m) throw new Error(`Invalid semantic version: ${value}`); return m.slice(1,4).map(Number) }
function assertCoreRange(range, id) {
  if (!range) return
  const core = versionTuple(coreVersion)
  if (range.startsWith('^')) {
    const wanted = versionTuple(range.slice(1))
    if (core[0] !== wanted[0] || core[1] < wanted[1] || (core[1] === wanted[1] && core[2] < wanted[2])) throw new Error(`${id} requires core ${range}, current is ${coreVersion}`)
    return
  }
  const exact = versionTuple(range)
  if (core.some((part, i) => part !== exact[i])) throw new Error(`${id} requires core ${range}, current is ${coreVersion}`)
}
function validateManifest(manifest, expectedKind, file) {
  if (!ID.test(String(manifest.id || ''))) throw new Error(`${file}: invalid id`)
  const kinds = Array.isArray(expectedKind) ? expectedKind : [expectedKind]
  if (!kinds.includes(manifest.kind)) throw new Error(`${file}: kind must be ${kinds.join(' or ')}`)
  if (manifest.apiVersion !== 1) throw new Error(`${file}: unsupported apiVersion`)
  versionTuple(manifest.version)
  assertCoreRange(manifest.requiresCore, manifest.id)
  const capabilities = new Set(['ui','admin','api','events','jobs','settings','storage'])
  for (const capability of manifest.capabilities || []) if (!capabilities.has(capability)) throw new Error(`${file}: unknown capability ${capability}`)
  const settingKeys = new Set()
  for (const setting of manifest.settings || []) {
    if (!/^[a-z][a-z0-9._-]{0,79}$/.test(String(setting.key || ''))) throw new Error(`${file}: invalid setting key ${setting.key}`)
    if (settingKeys.has(setting.key)) throw new Error(`${file}: duplicate setting key ${setting.key}`)
    settingKeys.add(setting.key)
  }
  for (const nav of manifest.adminNavigation || []) if (!String(nav.href || '').startsWith(`/admin/extensions/${manifest.id}`)) throw new Error(`${file}: adminNavigation must live under /admin/extensions/${manifest.id}`)
}
// The generated files are committed, and the build regenerates them on every server. They must come out byte for byte
// the same on Linux and Windows, or an installed site shows them as changed and its update stops. --check compares
// what would be written with the Git index (the committed bytes) and writes nothing.
const checkOnly = process.argv.includes('--check')
const outputs = []
function emit(file, text) { outputs.push([file, text]); if (!checkOnly) fs.writeFileSync(file, text) }
const lf = (text) => text.replace(/\r\n?/g, '\n')

fs.mkdirSync(extensionOut, { recursive: true })
fs.mkdirSync(themeOut, { recursive: true })

function packages(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
    .filter(name => fs.existsSync(path.join(dir, name, 'manifest.json'))).sort().map(name => {
      const file = path.join(dir, name, 'manifest.json')
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (manifest.id !== name) throw new Error(`${file}: manifest id must match directory name`)
      return { dir: name, manifest, file }
    })
}

// Feature modules (kind "module") ship with Core and live next to plugins so one
// manager activates both; their code stays in src/modules and checks the flag.
const plugins = packages(pluginsDir).map(x => { validateManifest(x.manifest, ['plugin', 'module'], x.file); return ({ ...x, client: fs.existsSync(path.join(pluginsDir, x.dir, 'client.tsx')), server: fs.existsSync(path.join(pluginsDir, x.dir, 'server.ts')) }) })
const catalogImports = plugins.map((x, i) => `import m${i} from '@/plugins/${x.dir}/manifest.json'`).join('\n')
emit(path.join(extensionOut, 'catalog.ts'), `${catalogImports}\nimport { assertUniqueExtensionIds, type ExtensionManifest } from '@/platform/extensions/contracts'\n\nexport const extensionCatalog = [${plugins.map((_, i) => `m${i}`).join(', ')}] as unknown as readonly ExtensionManifest[]\nassertUniqueExtensionIds(extensionCatalog)\nexport const extensionById = new Map(extensionCatalog.map((manifest) => [manifest.id, manifest]))\nexport const extensionPermissionIds = extensionCatalog.flatMap((manifest) => (manifest.permissions || []).map((permission) => permission.id))\n`)
const clientPlugins = plugins.filter(x => x.client)
emit(path.join(extensionOut, 'client-registry.ts'), `${clientPlugins.map((x,i)=>`import { plugin as p${i} } from '@/plugins/${x.dir}/client'`).join('\n')}\nimport type { PluginClientModule } from '@/plugins/types'\nexport const clientPlugins: Readonly<Record<string, PluginClientModule>> = {\n  ${clientPlugins.map((x,i)=>`'${x.dir}': p${i}`).join(',\n  ')}\n}\n`)
const serverPlugins = plugins.filter(x => x.server)
emit(path.join(extensionOut, 'server-registry.ts'), `${serverPlugins.map((x,i)=>`import { plugin as s${i} } from '@/plugins/${x.dir}/server'`).join('\n')}\nimport type { PluginServerModule } from '@/extensions/server/types'\nexport const serverPlugins: Readonly<Record<string, PluginServerModule>> = {\n  ${serverPlugins.map((x,i)=>`'${x.dir}': s${i}`).join(',\n  ')}\n}\n`)

const themes = packages(themesDir).map(x => { validateManifest(x.manifest, 'theme', x.file); return ({ ...x, client: fs.existsSync(path.join(themesDir, x.dir, 'client.tsx')), home: fs.existsSync(path.join(themesDir, x.dir, 'home.tsx')), css: fs.existsSync(path.join(themesDir, x.dir, 'theme.css')) }) })
for (const { manifest } of themes) {
  if (manifest.kind !== 'theme' || !manifest.design || manifest.design.id !== manifest.id) throw new Error(`Theme ${manifest.id} must declare kind=theme and a matching design manifest`)
}
emit(path.join(themeOut, 'catalog.ts'), `${themes.map((x,i)=>`import t${i} from '@/themes/code/${x.dir}/manifest.json'`).join('\n')}\nimport type { ThemeManifest } from '@/modules/site/config/types'\nexport const codeThemeCatalog = [${themes.map((_,i)=>`t${i}`).join(', ')}] as const\nexport const codeThemeDesigns: readonly ThemeManifest[] = codeThemeCatalog.map(theme => theme.design as ThemeManifest)\n`)
const clientThemes = themes.filter(x=>x.client)
emit(path.join(themeOut, 'client-registry.ts'), `${clientThemes.map((x,i)=>`import { theme as t${i} } from '@/themes/code/${x.dir}/client'`).join('\n')}\nimport type { ThemeClientModule } from '@/themes/types'\nexport const codeThemeClients: Readonly<Record<string, ThemeClientModule>> = {\n  ${clientThemes.map((x,i)=>`'${x.dir}': t${i}`).join(',\n  ')}\n}\n`)
const homeThemes = themes.filter(x=>x.home)
emit(path.join(themeOut, 'server-registry.ts'), `${homeThemes.map((x,i)=>`import { theme as t${i} } from '@/themes/code/${x.dir}/home'`).join('\n')}\nimport type { ThemeServerModule } from '@/themes/types'\nexport const codeThemeServers: Readonly<Record<string, ThemeServerModule>> = {\n  ${homeThemes.map((x,i)=>`'${x.dir}': t${i}`).join(',\n  ')}\n}\n`)
const css = themes.filter(x=>x.css).map(x=>`/* theme: ${x.dir} */\n${lf(fs.readFileSync(path.join(themesDir,x.dir,'theme.css'),'utf8'))}`).join('\n\n')
emit(path.join(root, 'src/themes/generated.css'), css + '\n')
function committed(file) {
  const name = path.relative(root, file).split(path.sep).join('/')
  try { return execFileSync('git', ['show', `:${name}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 << 20 }) }
  catch { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null }
}
if (checkOnly) {
  const stale = outputs.filter(([file, text]) => committed(file) !== text).map(([file]) => path.relative(root, file).split(path.sep).join('/'))
  if (stale.length) {
    console.error(`Generated extension files are out of date in Git: ${stale.join(', ')}\nRun "npm run extensions:generate" and commit the result.`)
    process.exit(1)
  }
  console.log(`Generated extension files match the source (${outputs.length} files).`)
} else console.log(`Generated registries for ${plugins.length} plugin(s) and ${themes.length} code theme(s).`)
