const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}


const a = load('src/modules/ai/domain/autofill')

const FIELDS = a.cleanSchema([
  { key: 'title', label: 'عنوان', type: 'text' },
  { key: 'slug', label: 'نامک', type: 'slug' },
  { key: 'year', label: 'سال', type: 'number' },
  { key: 'dubbed', label: 'دوبله', type: 'checkbox' },
  { key: 'kind', label: 'نوع', type: 'select', options: [{ value: 'MOVIE', label: 'فیلم سینمایی' }, { value: 'SERIES', label: 'سریال' }] },
  { key: 'cats', label: 'دسته‌ها', type: 'multiselect', options: [{ value: '3', label: 'اکشن' }, { value: '7', label: 'درام' }] },
  { key: 'released', label: 'تاریخ', type: 'date' },
  { key: 'content', label: 'متن', type: 'richtext' },
  { key: 'cast', label: 'بازیگران', type: 'records', recordKeys: [{ key: 'name', label: 'نام' }, { key: 'role', label: 'نقش' }] },
  { key: 'bad key!', label: 'x', type: 'text' },
  { key: 'image', label: 'تصویر', type: 'image' },
  { key: 'empty', label: 'بدون گزینه', type: 'select', options: [] },
])

test('schema keeps only fillable, well-formed fields', () => {
  assert.deepEqual(FIELDS.map((f) => f.key), ['title', 'slug', 'year', 'dubbed', 'kind', 'cats', 'released', 'content', 'cast'])
})

test('answer is parsed from tags or fences and cleaned per type', () => {
  const answer = `بفرمایید:\n<json>${JSON.stringify({
    title: '  تلقین  ', slug: 'Inception 2010!', year: '۲۰۱۰', dubbed: 'true', kind: 'سریال', cats: ['درام', '3', 'ناموجود'],
    released: '2010-07-16', content: '<h2 onclick="x()">داستان</h2><p>متن <a href="//evil">لینک</a></p><script>alert(1)</script>',
    cast: [{ name: 'لئوناردو دی‌کاپریو', role: 'کاب', extra: 'x' }, { name: '' }], status: 'PUBLISHED', _notes: 'حجم فایل در منبع نبود.',
  })}</json>`
  const r = a.parseAutofill(answer, FIELDS)
  assert.equal(r.values.title, 'تلقین')
  assert.equal(r.values.slug, 'inception-2010')
  assert.equal(r.values.year, 2010)
  assert.equal(r.values.dubbed, true)
  assert.equal(r.values.kind, 'SERIES', 'a label maps to its option value')
  assert.deepEqual(r.values.cats, ['7', '3'])
  assert.equal(r.values.released, '2010-07-16')
  assert.equal(r.values.content, '<h2>داستان</h2><p>متن لینک</p>')
  assert.deepEqual(r.values.cast, [{ name: 'لئوناردو دی‌کاپریو', role: 'کاب' }])
  assert.equal(r.values.status, undefined, 'fields outside the schema are never returned')
  assert.equal(r.notes, 'حجم فایل در منبع نبود.')
  const fenced = a.parseAutofill('```json\n{"title":"X","kind":"CARTOON","released":"16 July"}\n```', FIELDS)
  assert.deepEqual(fenced.values, { title: 'X' }, 'unknown option and bad date are dropped')
  assert.deepEqual(a.parseAutofill('no json here', FIELDS).filled, [])
})

test('prompt lists fields, options and existing values without the source overflowing', () => {
  const p = a.autofillPrompt({ brand: 'موبوکام', voice: 'صمیمی', section: 'cinema-titles', fields: FIELDS, source: 'x'.repeat(50_000), current: { title: 'تلقین', year: '', cats: [] } })
  assert.match(p.system, /فیلم یا سریال/)
  assert.match(p.user, /"kind" \(نوع\)/)
  assert.match(p.user, /"SERIES"=سریال/)
  assert.match(p.user, /"title":"تلقین"/)
  assert.ok(!/"year":/.test(p.user.split('منبع:')[0]), 'empty current values are not sent')
  assert.ok(p.user.length < 30_000)
})
