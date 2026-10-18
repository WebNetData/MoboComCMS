const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), ts = require('typescript')

test('Library subtitle bytes enforce real storage boundaries, limits and safe remote routing', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mobocom-subtitle-')), root = path.join(temp, 'library'), remote = []
  try {
    await fs.mkdir(root); await fs.writeFile(path.join(root, 'safe.ass'), 'subtitle'); await fs.writeFile(path.join(temp, 'outside.ass'), 'outside')
    const mod = { exports: {} }, source = ts.transpileModule(await fs.readFile('src/modules/media/server/subtitle-files.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
    new Function('require', 'module', 'exports', source)(name => name === '@/modules/downloads/server/files' ? { filesRoot: () => root, fetchRemoteBytes: async (url, max) => { remote.push({ url, max }); return Buffer.from('remote') } } : require(name), mod, mod.exports)
    const { subtitleBytes } = mod.exports
    assert.equal(Buffer.from(await subtitleBytes('/files/safe.ass?ignored=1', '', 8)).toString(), 'subtitle')
    for (const url of ['/files/../outside.ass', '/files/%2e%2e/outside.ass', '/files/.hidden', '/files/a%2fb.ass', '/files/a%5cb.ass', '/files/%00.ass', '/files/%zz']) await assert.rejects(subtitleBytes(url, '', 100), undefined, url)
    await assert.rejects(subtitleBytes('/files/safe.ass', '', 7), /too large/)
    await assert.rejects(subtitleBytes('/files/missing.ass', '', 100))
    await fs.mkdir(path.join(root, 'folder.ass')); await assert.rejects(subtitleBytes('/files/folder.ass', '', 100), /too large/)
    try { await fs.symlink(path.join(temp, 'outside.ass'), path.join(root, 'alias.ass')); await assert.rejects(subtitleBytes('/files/alias.ass', '', 100), /outside Library/) }
    catch (error) { if (error.code === 'EPERM') t.diagnostic('OS refused symlink creation; containment case not executed'); else throw error }
    assert.equal(remote.length, 0, 'invalid local paths never fall through to a remote fetch')
    assert.equal(Buffer.from(await subtitleBytes('https://example.invalid/a.ass', 'https://verified.invalid/a.ass', 100)).toString(), 'remote')
    assert.deepEqual(remote, [{ url: 'https://verified.invalid/a.ass', max: 100 }])
  } finally {
    assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep + 'mobocom-subtitle-'))
    await fs.rm(temp, { recursive: true, force: true })
  }
})
