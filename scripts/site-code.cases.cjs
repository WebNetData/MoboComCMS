const { test } = require('node:test'), assert = require('node:assert/strict'), source = require('./connected-source-loader.cjs')
test('site code: normalized, bounded and never on protected pages', () => {
  const c = source()('src/modules/site/domain/site-code.ts')
  const s = c.normalizeSiteCode({ enabled: true, snippets: [
    { id: 'sc-aaaa1111', name: 'GA', kind: 'html', location: 'head', code: '<script>1</script>', enabled: true, paths: ['/shop', 'bad path', '/blog/*'], exclude: '/shop/cart', audience: 'guests' },
    { id: 'sc-aaaa1111', name: 'dup', code: 'x', enabled: true },
    { id: 'evil"', code: 'x', enabled: true },
    { id: 'sc-bbbb2222', kind: 'css', location: 'body-end', code: 'body{}', enabled: true, audience: 'nope' },
  ] })
  assert.equal(s.snippets.length, 2)
  assert.deepEqual(s.snippets[0].paths, ['/shop', '/blog/*'])
  assert.deepEqual(s.snippets[0].exclude, ['/shop/cart'])
  assert.equal(s.snippets[1].location, 'head', 'CSS always goes to head')
  assert.equal(s.snippets[1].audience, 'all')
  assert.equal(c.normalizeSiteCode({ snippets: Array.from({ length: 40 }, (_, i) => ({ id: `sc-x${String(i).padStart(4, '0')}`, code: 'x' })) }).snippets.length, c.SITE_CODE_MAX)
  assert.equal(c.normalizeSiteCode({ enabled: 'yes' }).enabled, false)
  const ga = s.snippets[0]
  assert.equal(c.snippetRuns(ga, '/shop', false), true)
  assert.equal(c.snippetRuns(ga, '/shop/item', false), true)
  assert.equal(c.snippetRuns(ga, '/shopping', false), false)
  assert.equal(c.snippetRuns(ga, '/shop/cart', false), false)
  assert.equal(c.snippetRuns(ga, '/blog/a/b', false), true)
  assert.equal(c.snippetRuns(ga, '/shop', true), false, 'guests only')
  const all = { ...s.snippets[1], paths: [], exclude: [] }
  for (const p of ['/admin', '/admin/custom-code', '/api/x', '/login', '/install', '/builder-preview/98']) assert.equal(c.snippetRuns(all, p, true), false, p)
  assert.equal(c.snippetRuns(all, '/', true), true)
  assert.equal(c.snippetRuns({ ...all, enabled: false }, '/', true), false)
  assert.deepEqual(c.liveSnippets({ ...s, enabled: false }), [])
  assert.match(c.newSnippetId(), /^sc-[a-z0-9]{8}$/)
})
