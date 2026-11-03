const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { checkRuntimeTraces } = require('./check-runtime-traces.cjs')
function fixture(work) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobocom-traces-')), output = path.join(root, '.next')
  fs.mkdirSync(path.join(output, 'server'), { recursive: true }); fs.writeFileSync(path.join(output, 'BUILD_ID'), 'owned-test')
  const manifest = path.join(output, 'server', 'page.js.nft.json')
  try { work(root, output, manifest) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
test('release traces keep code and dependencies, including names containing the word storage', () => fixture((root, output, manifest) => {
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, files: ['../../src/modules/media/server/private-files.ts', '../../node_modules/package/storage.js'] }))
  assert.deepEqual(checkRuntimeTraces(root), { manifests: 1, entries: 2 })
}))
test('private uploads and runtime credentials are refused, including normalized traversal', () => fixture((root, output, manifest) => {
  for (const relative of ['private-media/opaque-file', 'config/runtime.env', 'downloads/uploads/guide.pdf']) {
    fs.writeFileSync(manifest, JSON.stringify({ version: 1, files: [path.relative(path.dirname(manifest), path.join(root, 'storage', 'nested', '..', relative))] }))
    assert.throws(() => checkRuntimeTraces(root), /Runtime storage must not be shipped/)
  }
}))
test('an incomplete build cannot claim runtime storage was excluded', () => fixture((root, output, manifest) => {
  fs.unlinkSync(path.join(output, 'BUILD_ID'))
  assert.throws(() => checkRuntimeTraces(root), /completed production build/)
}))
test('missing or malformed manifests fail closed', () => fixture((root, output, manifest) => {
  assert.throws(() => checkRuntimeTraces(root), /No production file traces/)
  fs.writeFileSync(manifest, JSON.stringify({ files: [null] }))
  assert.throws(() => checkRuntimeTraces(root), /Invalid build trace/)
}))
