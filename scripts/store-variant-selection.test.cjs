const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const source = fs.readFileSync(path.join(__dirname, '../src/modules/store/domain/store.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const compiledModule = { exports: {} }
new Function('require', 'module', 'exports', compiled)(require, compiledModule, compiledModule.exports)
const { variantOption } = compiledModule.exports

test('variant option preserves the current combination and reports contextual stock', () => {
  const blackSmall = { id: 1, attributes: { color: 'black', size: 'S' }, limit: 0 }
  const blackMedium = { id: 2, attributes: { color: 'black', size: 'M' }, limit: 3 }
  const whiteSmall = { id: 3, attributes: { color: 'white', size: 'S' }, limit: 2 }
  const variants = [blackSmall, blackMedium, whiteSmall]

  assert.deepEqual(variantOption(variants, whiteSmall, 'color', 'black'), {
    selected: blackSmall, inStock: false, changesOtherOptions: false,
  })
  assert.deepEqual(variantOption(variants, blackSmall, 'size', 'M'), {
    selected: blackMedium, inStock: true, changesOtherOptions: false,
  })
  assert.deepEqual(variantOption(variants, blackMedium, 'color', 'white'), {
    selected: whiteSmall, inStock: true, changesOtherOptions: true,
  })
  assert.deepEqual(variantOption(variants, blackMedium, 'color', 'green'), {
    selected: null, inStock: false, changesOtherOptions: false,
  })
})
