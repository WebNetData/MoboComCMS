const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
const read = (relative) => fs.readFileSync(path.resolve(root, relative), 'utf8')
const cache = new Map()
function load(relative) {
  const file = path.resolve(root, relative)
  if (cache.has(file)) return cache.get(file)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod.exports)
  const local = (name) => (name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(file), `${name}.ts`))) : require(name))
  new Function('require', 'module', 'exports', source)(local, mod, mod.exports)
  cache.set(file, mod.exports)
  return mod.exports
}
const bg = load('src/app/admin/branding/background.ts')
const { validateSite } = load('src/modules/site/config/validation.ts')
const { defaultSite } = load('src/modules/site/config/defaults.ts')

/** A logo on a navy background: a white ring (with navy inside it) in the middle, an empty navy margin. */
function picture(size = 24) {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, d = Math.hypot(x - 12, y - 12)
    const ring = d >= 4 && d <= 7
    data.set(ring ? [240, 240, 250, 255] : [10, 18, 40, 255], i)
  }
  return { data, width: size, height: size }
}
const alpha = (p, x, y) => p.data[(y * p.width + x) * 4 + 3]

test('the background colour comes from the corners, only when they agree', () => {
  const p = picture()
  assert.deepEqual(bg.cornerColor(p), [10, 18, 40])
  const mixed = picture(); mixed.data.set([255, 0, 0, 255], 0)
  assert.equal(bg.cornerColor(mixed), null, 'a red corner is not a flat background')
  assert.equal(bg.hasTransparency(p), false)
})

test('removing the background clears what touches the edges, keeps the logo and, unless asked, the inside of letters', () => {
  const p = picture()
  const cleared = bg.removeBackground(p, [10, 18, 40], 40)
  assert.equal(alpha(cleared, 0, 0), 0, 'the margin is clear')
  assert.equal(alpha(cleared, 12, 6), 255, 'the ring stays')
  assert.equal(alpha(cleared, 12, 12), 255, 'the inside of the ring stays by default')
  const everywhere = bg.removeBackground(p, [10, 18, 40], 40, true)
  assert.equal(alpha(everywhere, 12, 12), 0, '"everywhere" clears it too')
  assert.equal(alpha(p, 0, 0), 255, 'the original pixels are untouched')
  assert.equal(bg.hasTransparency(cleared), true)
})

test('the empty margin is cropped to the visible logo, with a little room', () => {
  const cleared = bg.removeBackground(picture(), [10, 18, 40], 40)
  const box = bg.visibleBox(cleared, 2)
  assert.deepEqual(box, { x: 3, y: 3, width: 19, height: 19 })
  const solid = picture()
  assert.deepEqual(bg.visibleBox(solid), { x: 0, y: 0, width: 24, height: 24 }, 'nothing transparent: the whole image')
})

test('the site accepts a wide logo, its dark version and a height, and refuses unsafe or odd values', () => {
  const site = { ...defaultSite, wordmark: '/uploads/covers/logo.webp', wordmarkDark: '/uploads/covers/logo-dark.webp', wordmarkHeight: 44 }
  assert.equal(validateSite(site), true)
  assert.equal(validateSite({ ...site, wordmark: 'javascript:alert(1)' }), false)
  assert.equal(validateSite({ ...site, wordmarkHeight: 300 }), false)
  assert.equal(validateSite({ ...site, wordmarkHeight: 40.5 }), false)
  assert.equal(validateSite({ ...defaultSite }), true, 'none of them is required')
})

test('every header and panel draws the wide logo when there is one', () => {
  assert.match(read('src/themes/sdk/client.ts'), /Wordmark as ThemeWordmark/)
  for (const file of ['src/themes/code/mobocom/client.tsx', 'src/themes/code/clean/client.tsx', 'src/themes/code/orbital/header.tsx', 'src/themes/code/orbital/footer.tsx']) assert.match(read(file), /ThemeWordmark/, file)
  assert.match(read('src/components/site/default-theme/DefaultSiteHeader.tsx'), /site\.wordmark \? <Wordmark/)
  for (const file of ['src/app/admin/layout.tsx', 'src/app/dashboard/layout.tsx', 'src/app/reseller/layout.tsx', 'src/app/seller/layout.tsx', 'src/app/welcome/page.tsx']) assert.match(read(file), /<BrandLockup \/>/, file)
  assert.match(read('src/app/admin/layout.tsx'), /href: '\/admin\/branding'[^\n]*perm: 'settings\.manage'/)
})
