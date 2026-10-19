const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const { siteRedirect } = load('src/platform/http/redirect.ts')

test('redirects to this site never carry the internal address (Docker: http://0.0.0.0:3000)', () => {
  // Built from request.url behind Docker, the way the routes do
  const internal = new URL('/music/track/x?dl=expired#downloads', 'http://0.0.0.0:3000/api/media/link/5')
  const res = siteRedirect(internal)
  assert.equal(res.status, 303)
  assert.equal(res.headers.get('location'), '/music/track/x?dl=expired#downloads')
  assert.equal(siteRedirect('/dl/abc/Song+%5B128%5D.mp3').headers.get('location'), '/dl/abc/Song+%5B128%5D.mp3')
  assert.equal(siteRedirect('/', 302).status, 302)
})

test('a file on another host keeps its address (brackets and spaces are encoded)', () => {
  const res = siteRedirect('https://sv2.mybia2music.com/s2/Music/Iliyar - Setare [128].mp3')
  assert.equal(res.headers.get('location'), 'https://sv2.mybia2music.com/s2/Music/Iliyar%20-%20Setare%20[128].mp3')
})

test('media routes build every redirect through siteRedirect', () => {
  const links = fs.readFileSync(path.resolve(root, 'src/modules/media/server/links.ts'), 'utf8')
  assert.equal((links.match(/NextResponse\.redirect\(/g) || []).length, 0)
  assert.ok((links.match(/siteRedirect\(/g) || []).length >= 4)
})
