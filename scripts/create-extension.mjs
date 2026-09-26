import fs from 'node:fs'
import path from 'node:path'

const id = String(process.argv[2] || '').trim()
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  console.error('Usage: npm run extension:new -- my-plugin  (lowercase kebab-case)')
  process.exit(1)
}
const root = process.cwd()
const dir = path.join(root, 'src/plugins', id)
if (fs.existsSync(dir)) throw new Error(`Extension already exists: ${id}`)
fs.mkdirSync(dir, { recursive: true })
const title = id.split('-').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ')
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
  id, name: title, description: `${title} extension`, version: '0.1.0', kind: 'plugin', apiVersion: 1,
  requiresCore: '^1.0.0', defaultEnabled: false, capabilities: ['ui', 'settings'], settings: [], permissions: [], adminNavigation: [],
}, null, 2) + '\n')
fs.writeFileSync(path.join(dir, 'client.tsx'), `import type { PluginClientModule } from '@/plugins/types'\n\nexport const plugin: PluginClientModule = {\n  ui: [],\n}\n`)
fs.writeFileSync(path.join(dir, 'server.ts'), `import type { PluginServerModule } from '@/extensions/server/types'\n\nexport const plugin: PluginServerModule = {\n  api: [],\n  events: {},\n  jobs: {},\n}\n`)
console.log(`Created src/plugins/${id}`)
console.log('Run: npm run extensions:generate')
