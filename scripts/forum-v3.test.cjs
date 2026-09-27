const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

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

const d = load('src/modules/forum/domain/discourse')
const c = load('src/modules/forum/domain/community')
const md = load('src/modules/forum/domain/markdown')
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')

test('polls parse with stable option ids and bounded choices', () => {
  const polls = d.parsePolls('intro\n[poll name=lunch type=multiple max=2 results=always title="ناهار؟"]\n- کباب\n- پیتزا\n- سالاد\n[/poll]\nmore\n[poll]\n- بله\n- نه\n[/poll]')
  assert.equal(polls.length, 2)
  assert.equal(polls[0].name, 'lunch')
  assert.equal(polls[0].type, 'multiple')
  assert.equal(polls[0].max, 2)
  assert.equal(polls[0].results, 'always')
  assert.equal(polls[0].title, 'ناهار؟')
  assert.equal(polls[1].name, 'poll')
  assert.equal(polls[1].max, 1)
  assert.equal(d.optionId('کباب'), polls[0].options[0].id, 'ids depend only on the label')
  assert.throws(() => d.parsePolls('[poll]\n- only one\n[/poll]'), /دو گزینه/)
  assert.throws(() => d.parsePolls('[poll]\n- a\n- b\n[/poll]\n[poll]\n- c\n- d\n[/poll]'), /تکراری/)
})

test('votes are validated against type, bounds and closing', () => {
  const poll = { type: 'multiple', min: 1, max: 2, options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], closed: false, closesAt: null }
  assert.deepEqual(d.validateVote(poll, ['a', 'b', 'a']), ['a', 'b'])
  assert.throws(() => d.validateVote(poll, ['a', 'b', 'c']))
  assert.throws(() => d.validateVote(poll, ['zzz']))
  assert.throws(() => d.validateVote({ ...poll, type: 'regular', max: 1 }, ['a', 'b']))
  assert.throws(() => d.validateVote({ ...poll, closed: true }, ['a']), /بسته/)
  assert.throws(() => d.validateVote({ ...poll, closesAt: new Date(Date.now() - 1000) }, ['a']), /بسته/)
  assert.equal(d.resultsVisible({ results: 'on_vote', closed: false, closesAt: null }, false, false), false)
  assert.equal(d.resultsVisible({ results: 'on_vote', closed: false, closesAt: null }, true, false), true)
  assert.equal(d.resultsVisible({ results: 'on_close', closed: false, closesAt: null }, true, false), false)
  assert.equal(d.resultsVisible({ results: 'on_close', closed: true, closesAt: null }, false, false), true)
})

test('markdown turns polls into a slot and never renders the raw block', () => {
  const html = md.renderMarkdown('before\n[poll name=x title="<b>t</b>"]\n- a\n- b\n[/poll]\nafter')
  assert.match(html, /<div class="fr-poll-slot" data-poll="x"><\/div>/)
  assert.doesNotMatch(html, /\[poll|<b>t/)
  assert.match(md.markdownExcerpt('[poll title="سؤال"]\n- a\n- b\n[/poll]'), /📊 سؤال/)
})

test('watched words match whole words, wildcards and Arabic/Persian letter variants', () => {
  assert.equal(d.findWatched('این کارت منه', ['کار']), null)
  assert.equal(d.findWatched('این کار منه', ['کار']), 'کار')
  assert.equal(d.findWatched('سايت قمارباز', ['قمار*']), 'قمار*')
  assert.equal(d.findWatched('BUY now', ['buy']), 'buy')
  assert.equal(d.censorText('سلام احمق جان', ['احمق']), 'سلام ■■■■ جان')
  assert.equal(d.censorText('no match here', ['bad']), 'no match here')
  const settings = { approveNewUserPosts: 2, watchedWords: { block: ['spam'], approve: ['link'], censor: [] } }
  assert.equal(d.contentVerdict({ text: 'this is spam', viewer: { moderator: false, trustLevel: 2 }, approvedPosts: 9, settings }).action, 'block')
  assert.equal(d.contentVerdict({ text: 'this is spam', viewer: { moderator: true, trustLevel: 0 }, approvedPosts: 0, settings }).action, 'publish')
  assert.equal(d.contentVerdict({ text: 'a link', viewer: { moderator: false, trustLevel: 3 }, approvedPosts: 9, settings }).action, 'review')
  assert.equal(d.contentVerdict({ text: 'hello', viewer: { moderator: false, trustLevel: 0 }, approvedPosts: 1, settings }).action, 'review')
  assert.equal(d.contentVerdict({ text: 'hello', viewer: { moderator: false, trustLevel: 0 }, approvedPosts: 2, settings }).action, 'publish')
})

test('settings normalize watched words and new switches', () => {
  const s = c.normalizeForumSettings({ watchedWords: { block: ' Spam \n spam\nx\n<b>' }, messagesMinTrust: 9, approveNewUserPosts: -3 })
  assert.deepEqual(s.watchedWords.block, ['spam'], 'lowercased, unique, markup stripped, too-short dropped')
  assert.equal(s.messagesMinTrust, 4)
  assert.equal(s.approveNewUserPosts, 0)
  assert.equal(s.messagesEnabled, true)
})

test('slow mode, timers and wiki editing', () => {
  const now = new Date('2026-01-01T12:00:00Z')
  assert.equal(d.slowModeWait(600, new Date('2026-01-01T11:55:00Z'), now), 300)
  assert.equal(d.slowModeWait(600, new Date('2026-01-01T11:40:00Z'), now), 0)
  assert.equal(d.slowModeWait(0, now, now), 0)
  assert.equal(d.parseCloseAt({ hours: 24 }, now).toISOString(), '2026-01-02T12:00:00.000Z')
  assert.equal(d.parseCloseAt({ hours: null }, now), null)
  assert.throws(() => d.parseCloseAt({ at: '2025-01-01' }, now))
  assert.throws(() => d.parseCloseAt({ hours: 24 * 400 }, now))
  assert.equal(d.timerDue(new Date('2026-01-01T11:00:00Z'), now), true)
  const viewer = { userId: 5, groupIds: [], trustLevel: 1, moderator: false, member: false, silenced: false, suspended: false }
  assert.equal(c.canEditPost({ userId: 9, createdAt: new Date(0), wiki: true }, viewer, 24), true)
  assert.equal(c.canEditPost({ userId: 9, createdAt: new Date(0), wiki: false }, viewer, 24), false)
  assert.equal(c.canEditPost({ userId: 9, createdAt: new Date(0), wiki: true }, { ...viewer, trustLevel: 0 }, 24), false)
})

test('personal message recipients and permissions', () => {
  assert.deepEqual(d.parseRecipients('@Ali, sara  ali'), ['ali', 'sara'])
  assert.throws(() => d.parseRecipients(''))
  assert.throws(() => d.parseRecipients(Array.from({ length: 11 }, (_, i) => `user${i}x`)))
  const base = { userId: 1, moderator: false, trustLevel: 1, silenced: false, suspended: false }
  assert.equal(d.canStartMessage(base, { messagesEnabled: true, messagesMinTrust: 1 }), true)
  assert.equal(d.canStartMessage({ ...base, trustLevel: 0 }, { messagesEnabled: true, messagesMinTrust: 1 }), false)
  assert.equal(d.canStartMessage(base, { messagesEnabled: false, messagesMinTrust: 0 }), false)
  assert.equal(d.canStartMessage({ ...base, moderator: true, trustLevel: 0 }, { messagesEnabled: false, messagesMinTrust: 4 }), true)
  assert.equal(d.canStartMessage({ ...base, silenced: true }, { messagesEnabled: true, messagesMinTrust: 0 }), false)
})

test('moving posts keeps the opening post in place', () => {
  assert.deepEqual(d.normalizeMoveSelection([5, '3', 3, -1, 'x']), [3, 5])
  assert.throws(() => d.normalizeMoveSelection([1, 2]), /پیام اول/)
  assert.throws(() => d.normalizeMoveSelection([]))
})

test('private messages and unlisted/pending topics stay out of public surfaces', () => {
  const forum = read('src/modules/forum/server/forum.ts')
  assert.match(forum, /where\.listed = true/)
  assert.match(forum, /listed: true, categoryId: \{ in: scope \}/, 'search skips unlisted topics')
  assert.match(read('src/modules/site/server/pages/sitemap.ts'), /status: 'VISIBLE', listed: true/)
  assert.match(read('src/modules/content/server/registry.ts'), /listed: true/)
  const messages = read('src/modules/forum/server/messages.ts')
  assert.match(messages, /conversationId_userId: \{ conversationId, userId: viewer\.userId \}/, 'conversations load through the viewer membership')
  assert.doesNotMatch(read('src/modules/search/server/search.ts').concat(read('src/modules/site/server/pages/sitemap.ts')), /forumMessage|forumConversation/)
  const actions = read('src/modules/forum/server/actions.ts')
  assert.match(actions, /status: pending \? 'PENDING' : 'VISIBLE'/)
  assert.match(actions, /if \(pending\) return/, 'held posts send no notifications')
})
