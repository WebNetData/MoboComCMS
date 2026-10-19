const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const file = path.resolve(__dirname, '../src/modules/watermark/domain/watermark.ts')
const mod = { exports: {} }
new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(mod, mod.exports, require)
const { normalizeWatermark, shouldWatermark, placement, markSize, appearanceKey, fileOfUrl, DEFAULT_WATERMARK } = mod.exports

const A = '11111111-1111-1111-1111-111111111111.webp'
const B = '22222222-2222-2222-2222-222222222222.png'
const LOGO = '33333333-3333-3333-3333-333333333333.png'
const on = (patch = {}) => normalizeWatermark({ enabled: true, text: 'موبوکام', ...patch })

test('settings are validated and default to off', () => {
  assert.equal(DEFAULT_WATERMARK.enabled, false)
  const s = normalizeWatermark({ enabled: true, position: 'nowhere', size: 500, opacity: -3, color: 'red', text: '<b>x</b>', sections: ['blog', 'hack'], roles: ['main', 'x'], include: [A, 'bad.png'] })
  assert.equal(s.position, 'bottom-left')
  assert.equal(s.size, 80)
  assert.equal(s.opacity, 5)
  assert.equal(s.color, '#ffffff')
  assert.equal(s.text, 'b x /b')
  assert.deepEqual(s.sections, ['blog'])
  assert.deepEqual(s.roles, ['main'])
  assert.deepEqual(s.include, [A])
  assert.equal(normalizeWatermark({ image: `/api/media/covers/${LOGO}?w=320` }).image, `/api/media/covers/${LOGO}`)
  assert.equal(normalizeWatermark({ image: 'https://evil.example/x.png' }).image, '')
})

test('which images get the mark', () => {
  const blogMain = { sections: ['blog'], roles: ['main'] }
  const storeContent = { sections: ['store'], roles: ['content'] }
  assert.ok(!shouldWatermark(A, 1200, normalizeWatermark({ text: 'x' }), blogMain), 'off')
  assert.ok(!shouldWatermark(A, 1200, on({ text: '' }), blogMain), 'nothing to draw')
  assert.ok(shouldWatermark(A, 1200, on(), blogMain), 'all')
  assert.ok(!shouldWatermark(A, 320, on(), blogMain), 'thumbnail below min width')
  assert.ok(!shouldWatermark(A, 1200, on(), undefined), 'unused image (avatar/logo)')
  assert.ok(shouldWatermark(A, 1200, on({ include: [A] }), undefined), 'always')
  assert.ok(!shouldWatermark(A, 1200, on({ exclude: [A] }), blogMain), 'never')
  assert.ok(!shouldWatermark(A, 1200, on({ scope: 'sections', sections: ['store'] }), blogMain), 'other section')
  assert.ok(shouldWatermark(B, 1200, on({ scope: 'sections', sections: ['store'] }), storeContent), 'chosen section')
  assert.ok(!shouldWatermark(B, 1200, on({ roles: ['main'] }), storeContent), 'content images off')
  assert.ok(!shouldWatermark(A, 1200, on({ scope: 'selected' }), blogMain), 'selected only')
  assert.ok(shouldWatermark(A, 1200, on({ scope: 'selected', include: [A] }), blogMain), 'selected and chosen')
  assert.ok(!shouldWatermark(LOGO, 1200, on({ kind: 'image', image: `/api/media/covers/${LOGO}`, include: [LOGO] }), blogMain), 'never the logo itself')
})

test('size and placement', () => {
  const img = { width: 1000, height: 600 }
  const size = markSize(img, { width: 400, height: 100 }, 20)
  assert.deepEqual(size, { width: 200, height: 50 })
  assert.deepEqual(markSize(img, { width: 100, height: 400 }, 50), { width: 75, height: 300 })
  assert.deepEqual(placement(img, size, 'bottom-left', 3), { left: 30, top: 520 })
  assert.deepEqual(placement(img, size, 'top-right', 3), { left: 770, top: 30 })
  assert.deepEqual(placement(img, size, 'center', 3), { left: 400, top: 275 })
  assert.deepEqual(placement(img, size, 'bottom', 0), { left: 400, top: 550 })
})

test('appearance key changes with the look, not with the scope', () => {
  assert.equal(appearanceKey(on()), appearanceKey(on({ scope: 'selected', include: [A] })))
  assert.notEqual(appearanceKey(on()), appearanceKey(on({ position: 'center' })))
  assert.equal(fileOfUrl(`/api/media/covers/${A}?w=640`), A)
  assert.equal(fileOfUrl('/api/media/covers/../../etc/passwd'), '')
})
