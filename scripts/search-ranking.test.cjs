const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript-api')
const path = require('node:path')
const mod = { exports: {} }
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/modules/search/domain/ranked-window.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
new Function('module', 'exports', code)(mod, mod.exports)
const { RankedWindow } = mod.exports
const typoMod = { exports: {} }
const typoCode = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/modules/search/domain/typo-correction.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
new Function('module', 'exports', typoCode)(typoMod, typoMod.exports)
const { typoCandidateTerms, correctionFromTitle } = typoMod.exports

test('bounded ranking matches a complete sort for late leaders, ties and mixed insertion orders', () => {
  const compare = (a, b) => b.score - a.score || b.date - a.date || b.boost - a.boost || a.id - b.id
  let seed = 71
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed }
  const rows = Array.from({ length: 12001 }, (_, id) => ({ id, score: next() % 100, date: next() % 50, boost: next() % 20 }))
  rows[12000].score = 1000
  for (const input of [rows, [...rows].reverse(), [...rows].sort((a, b) => a.score - b.score)]) {
    for (const limit of [0, 1, 20, 1000, 15000]) {
      const window = new RankedWindow(limit, compare)
      for (const row of input) { window.add(row); assert.ok(window.size <= limit) }
      const expected = [...input].sort(compare).slice(0, limit)
      assert.deepEqual(window.sorted(), expected)
      assert.deepEqual(window.sorted(), expected, 'reading the result does not destroy retained candidates')
    }
  }
})

test('lower ranked arrivals do not repeatedly sort the retained result window', () => {
  let comparisons = 0
  const compare = (a, b) => { comparisons++; return a - b }
  const window = new RankedWindow(1000, compare)
  for (let id = 0; id < 1000; id++) window.add(id)
  comparisons = 0
  for (let id = 1000; id < 30000; id++) window.add(id)
  assert.equal(comparisons, 29000, 'each lower-ranked arrival needs only the current boundary comparison')
  assert.deepEqual(window.sorted(), Array.from({ length: 1000 }, (_, id) => id))
})

test('typo recovery generates a bounded trigram candidate set and excludes short or numeric tokens', () => {
  const terms = typoCandidateTerms(['interstllar', '2', 'abc'])
  assert.ok(terms.length > 0 && terms.length <= 24)
  assert.ok(terms.includes('int'))
  assert.ok(!terms.includes('abc'))
  assert.ok(!terms.includes('2'))
})

test('title-based correction accepts one edit, preserves exact query tokens, and rejects ambiguity', () => {
  assert.equal(correctionFromTitle(['interstllar'], 'interstellar'), 'interstellar')
  assert.equal(correctionFromTitle(['interstllar', 'film'], 'interstellar film'), 'interstellar film')
  assert.equal(correctionFromTitle(['interstllar'], 'international'), null)
  assert.equal(correctionFromTitle(['catt'], 'cast cart'), null)
  assert.equal(correctionFromTitle(['abc'], 'abcd'), null)
  assert.equal(correctionFromTitle(['1234'], '1235'), null)
})
