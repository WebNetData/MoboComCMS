import fs from 'node:fs'
import path from 'node:path'

const id = String(process.argv[2] || '').trim()
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  console.error('Usage: npm run theme:new -- my-theme  (lowercase kebab-case)')
  process.exit(1)
}
const root = process.cwd()
const dir = path.join(root, 'src/themes/code', id)
if (fs.existsSync(dir)) throw new Error(`Theme already exists: ${id}`)
fs.mkdirSync(dir, { recursive: true })
const title = id.split('-').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ')
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
  id, name: title, description: `${title} code theme`, version: '0.1.0', kind: 'theme', apiVersion: 1, requiresCore: '^1.0.0', capabilities: ['ui'],
  design: { id, name: title, description: `${title} design`, version: '0.1.0', radius: 16, colors: { background: '#0b0f14', surface: '#121821', accent: '#79e2a8', text: '#f2f5f7', muted: '#9aa6b2', border: '#283241' } }
}, null, 2) + '\n')
fs.writeFileSync(path.join(dir, 'client.tsx'), `'use client'\nimport { DefaultThemeHeader, DefaultThemeFooter } from '@/themes/sdk/client'\nimport type { ThemeClientModule } from '@/themes/types'\n\nexport const theme: ThemeClientModule = { Header: DefaultThemeHeader, Footer: DefaultThemeFooter }\n`)
fs.writeFileSync(path.join(dir, 'home.tsx'), `import { DefaultThemeHome } from '@/themes/sdk/server'\nimport type { ThemeServerModule } from '@/themes/types'\n\nexport const theme: ThemeServerModule = { Home: DefaultThemeHome }\n`)
fs.writeFileSync(path.join(dir, 'theme.css'), `[data-code-theme="${id}"], [data-design="${id}"] { /* Theme-specific overrides */ }\n`)
console.log(`Created src/themes/code/${id}`)
console.log('Run: npm run extensions:generate')
