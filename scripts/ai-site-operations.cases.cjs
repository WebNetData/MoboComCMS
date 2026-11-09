const { test } = require('node:test'), assert = require('node:assert/strict'), source = require('./connected-source-loader.cjs')
test('site operations: errors group by signature, personal data is removed, causes map to allowed paths', () => {
  const o = source()('src/modules/ai/domain/site-operations.ts')
  const at = i => new Date(Date.UTC(2026, 10, 9, 10, i)).toISOString()
  const groups = o.groupErrors([
    { source: 'server', at: at(1), event: 'api.order', message: "TypeError: Cannot read properties of undefined (reading 'id') order 123", path: '/api/orders/123' },
    { source: 'server', at: at(2), event: 'api.order', message: "TypeError: Cannot read properties of undefined (reading 'id') order 456", path: '/api/orders/456' },
    { source: 'mail', at: at(3), event: 'mail.send', message: 'Invalid login: 535 auth failed for owner@example.com' },
    { source: 'job', at: at(4), event: 'search.rebuild', message: 'P2021 relation "SearchDoc" does not exist' },
  ])
  assert.equal(groups.length, 3)
  assert.equal(groups[0].count, 2)
  assert.deepEqual(groups[0].paths, ['/api/orders/#'])
  assert.equal(groups[0].cause.id, 'code')
  assert.deepEqual(groups[0].cause.action, { kind: 'engineering', mode: 'DEVELOP' })
  const mail = groups.find(g => g.source === 'mail')
  assert.equal(mail.cause.action.href, '/admin/email')
  assert(!JSON.stringify(mail).includes('owner@example.com'))
  assert.equal(groups.find(g => g.source === 'job').cause.id, 'migration')
  assert.equal(o.probableCause({ source: 'server', event: 'proxy', signature: '502 Bad Gateway' }).action.mode, 'REPAIR')
  assert.equal(o.probableCause({ source: 'ai', event: 'ai.support', signature: 'custom unavailable #', samples: ['custom unavailable 502'] }).id, 'ai-provider')
  assert.equal(o.probableCause({ source: 'ai', event: 'ai.admin', signature: 'gemini quota #' }).id, 'ai-credential')
  assert.match(o.sanitize('token=abc123 call 09121234567 from 10.0.0.1'), /token=<redacted> call <phone> from <ip>/)
  assert(!o.engineeringBrief(mail).includes('example.com'))
})
test('site operations: the model summary is bounded and may only name known groups', () => {
  const o = source()('src/modules/ai/domain/site-operations.ts')
  const s = o.parseSummary(JSON.stringify({ summary: 'خلاصه https://evil.example <b>x</b>', findings: [{ groupId: 'a', cause: 'علت', confidence: 'high' }, { groupId: 'zzz', cause: 'ساختگی' }, { groupId: 'a', cause: 'دوم', confidence: 'certain' }] }), ['a'])
  assert.equal(s.findings.length, 2)
  assert.equal(s.findings[1].confidence, 'low')
  assert(!s.summary.includes('http') && !s.summary.includes('<'))
  assert.throws(() => o.parseSummary('not json', ['a']))
  const w = source()('src/modules/ai/domain/workspace.ts'), now = Date.now(), base = { actor: '1', kind: 'engineering', instruction: 'x', source: '/admin/ai/site-operations', expires: now + 60000 }
  assert.equal(w.workspaceBrief({ ...base, mode: 'REPAIR' }, '1', 'engineering', now).mode, 'REPAIR')
  assert.equal(w.workspaceBrief({ ...base, mode: 'DEPLOY' }, '1', 'engineering', now), null)
  assert.equal(w.workspaceBrief({ ...base, kind: 'operations', mode: 'REPAIR' }, '1', 'operations', now), null)
})
