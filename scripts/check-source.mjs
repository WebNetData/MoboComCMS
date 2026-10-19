import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript-api')

const root = process.cwd()
const src = path.join(root, 'src')
const exts = ['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.css','.scss']
const errors = []
let count = 0

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [p] : []
  })
}
function resolves(spec) {
  const base = path.join(src, spec.slice(2))
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return true
  for (const ext of exts) if (fs.existsSync(base + ext)) return true
  for (const ext of exts) if (fs.existsSync(path.join(base, 'index' + ext))) return true
  return false
}

for (const file of walk(src)) {
  count++
  const text = fs.readFileSync(file, 'utf8')
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const result = ts.transpileModule(text, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve },
  })
  for (const d of result.diagnostics || []) {
    if (d.category !== ts.DiagnosticCategory.Error) continue
    const pos = d.file && typeof d.start === 'number' ? d.file.getLineAndCharacterOfPosition(d.start) : null
    errors.push(`${path.relative(root,file)}${pos ? `:${pos.line+1}:${pos.character+1}` : ''}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, kind)
  function visit(node) {
    let spec
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) spec = node.moduleSpecifier.text
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) spec = node.arguments[0].text
    if (spec?.startsWith('@/') && !resolves(spec)) errors.push(`${path.relative(root,file)}: unresolved internal import ${spec}`)
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

if (errors.length) {
  console.error(`Source check failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n` + errors.map(e => ` - ${e}`).join('\n'))
  process.exit(1)
}
console.log(`Source syntax/import check OK (${count} TS/TSX files)`)
