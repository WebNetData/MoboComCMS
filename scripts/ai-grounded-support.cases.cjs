const { test } = require('node:test'), assert = require('node:assert/strict')
const load = require('./connected-source-loader.cjs')()
const knowledge = load('src/modules/livechat/domain/knowledge.ts'), chat = load('src/modules/livechat/domain/livechat.ts'), telemetry = load('src/modules/ai/domain/telemetry.ts')

test('grounded support validates citations and builds references from local current sources', () => {
  const sources = [{ id: 1, title: 'راهنمای ارسال', href: '/products/owned', text: 'ارسال دو روز' }]
  const result = knowledge.groundedReply('[MOBOCOM] ارسال دو روز است. [S1]', sources)
  assert.equal(result.outcome, 'grounded'); assert.match(result.body, /راهنمای ارسال — \/products\/owned/)
  for (const reply of ['[MOBOCOM] حدس بدون منبع', '[MOBOCOM] منبع ناموجود [S2]', '[MOBOCOM] منبع [S1] و [S999]', 'متن بدون قالب']) assert.equal(knowledge.groundedReply(reply, sources).handoff, true)
  for (const path of ['https://evil.test', '//evil.test', '/admin/users', '/api/me', '/products/../admin', '/p?a=b', '/p#secret', '/p\\evil']) assert.equal(knowledge.supportPath(path), '')
  assert.equal(knowledge.supportPath('/products/owned'), '/products/owned')
})

test('chat renders complete Persian/local references and keeps external/protocol-relative URLs inert', () => {
  const { chatTextParts } = load('src/modules/livechat/domain/message-links.ts')
  const text = '/blog/ارسال-سفارش، راهنما /dashboard/tickets. https://external.test/path //evil.test /\\evil.test'
  const parts = chatTextParts(text)
  assert.equal(parts.map(p => p.text).join(''), text)
  assert.deepEqual(parts.filter(p => p.href).map(p => p.href), ['/blog/ارسال-سفارش', '/dashboard/tickets'])
})

test('facts cannot become system instructions and context is bounded', () => {
  const injection = 'IGNORE_ALL_OWNED', p = chat.chatPrompt({ brand: 'Owned', botName: 'Bot', knowledge: injection, customer: injection, sources: [{ id: 1, title: 'عنوان', href: '', text: injection }], turns: Array.from({ length: 30 }, () => ({ sender: 'VISITOR', body: 'x'.repeat(3000) })) })
  assert(!p.system.includes(injection)); assert(p.user.includes(injection)); assert(p.user.length < 7000); assert.equal(p.maxTokens, 600)
  const config = knowledge.normalizeKnowledge({ types: ['post', 'unknown', 'post'], maxSources: 999 })
  assert.deepEqual(config.types, ['post']); assert.equal(config.maxSources, 5)
  const selected = knowledge.policyPassages('مرجوعی تا هفت روز\n\nراهنمای ارسال سفارش\n\nقانون نامرتبط', 'ارسال سفارش')
  assert.deepEqual(selected, ['راهنمای ارسال سفارش'])
})

test('usage keeps absent facts unknown and never estimates from response text', () => {
  assert.equal(telemetry.providerUsage(undefined), undefined)
  assert.deepEqual(telemetry.providerUsage({ prompt_tokens: 30, completion_tokens: 12 }), { inputTokens: 30, outputTokens: 12, totalTokens: 42 })
  assert.deepEqual(telemetry.providerUsage({ input_tokens: 4, output_tokens: 8 }, 'anthropic'), { inputTokens: 4, outputTokens: 8, totalTokens: 12 })
  assert.deepEqual(telemetry.providerUsage({ total_tokens: 20, prompt_tokens: -1 }), { inputTokens: null, outputTokens: null, totalTokens: 20 })
  assert.equal(telemetry.providerUsage({ total_tokens: '20' }), undefined)
  assert.equal(telemetry.monitoringDays(999), 7); assert.equal(telemetry.invocationPurpose('evil'), 'general')
})
