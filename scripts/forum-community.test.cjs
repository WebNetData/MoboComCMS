const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}.ts`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}
const md = load('src/modules/forum/domain/markdown.ts')
const c = load('src/modules/forum/domain/community.ts')

test('markdown escapes user HTML and only links http(s) or same-site paths', () => {
  const attacks = [
    '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '[x](javascript:alert(1))', '![a](javascript:alert(1))', '[x](//evil.example)',
    '![a" onerror="alert(1)](https://x.example/a.png)', '[a](https://x.example/"onmouseover=alert(1))', '\u00000\u0000<b>', '[quote="x<b>, post:1, topic:1"]hi[/quote]',
  ]
  for (const attack of attacks) {
    const html = md.renderMarkdown(attack)
    assert.doesNotMatch(html, /<script|<[^>]*\s(?:onerror|onmouseover)=(?!&quot;)|href="javascript|href="\/\/|<img src=x|<b>/i, attack)
  }
  assert.match(md.renderMarkdown('see https://example.org/a?b=1&c=2.'), /href="https:\/\/example\.org\/a\?b=1&amp;c=2" target="_blank" rel="nofollow ugc noopener noreferrer"/)
  assert.match(md.renderMarkdown('[internal](/forum/t/3)'), /<a href="\/forum\/t\/3">internal<\/a>/)
  assert.doesNotMatch(md.renderMarkdown('![p](https://a.example/p.png)', { images: false }), /<img/)
  assert.match(md.renderMarkdown('![p](https://a.example/p.png)'), /<img src="https:\/\/a\.example\/p\.png" alt="p"/)
})

test('markdown structure: headings, lists, quotes, code, emphasis, mentions and emoji', () => {
  const html = md.renderMarkdown('# عنوان\n- یک\n- دو\n\n1. a\n\n> نقل **مهم**\n\n```js\nconst x = "<b>"\n```\n`a<b>` **b** *i* ~~s~~ :fire: @Sara_1 snake_case_word')
  assert.match(html, /<h3>عنوان<\/h3><ul><li>یک<\/li><li>دو<\/li><\/ul><ol><li>a<\/li><\/ol>/)
  assert.match(html, /<blockquote><p dir="auto">نقل <strong>مهم<\/strong><\/p><\/blockquote>/)
  assert.match(html, /<pre><code class="lang-js">const x = &quot;&lt;b&gt;&quot;<\/code><\/pre>/)
  assert.match(html, /<code>a&lt;b&gt;<\/code> <strong>b<\/strong> <em>i<\/em> <del>s<\/del> 🔥 <a class="fr-mention" href="\/forum\/u\/sara_1">@Sara_1<\/a> snake_case_word/)
  const quote = md.renderMarkdown('[quote="sara, post:3, topic:12"]\nسلام\n[/quote]\nپاسخ')
  assert.match(quote, /<aside class="fr-quote"><div class="fr-quote-head"><a href="\/forum\/t\/12#post-3">@sara<\/a>:<\/div><blockquote><p dir="auto">سلام<\/p><\/blockquote><\/aside><p dir="auto">پاسخ<\/p>/)
  assert.deepEqual(md.extractMentions('hi @Ali and @sara `@code`\n> @quoted\n@ali'), ['ali', 'sara'])
  assert.equal(md.markdownExcerpt('# سلام **دنیا** [لینک](https://a.example) :fire:'), 'سلام دنیا لینک 🔥')
  assert.equal(md.countLinks('https://a.example http://b.example'), 2)
})

test('category access follows group permissions, legacy VIP/lock rules and posting bans', () => {
  const base = { ...c.GUEST, userId: 5, groupIds: [1, 4], trustLevel: 1 }
  const restricted = { access: 'PUBLIC', locked: false, permissions: [{ groupId: 1, level: 'SEE' }, { groupId: 7, level: 'CREATE' }] }
  assert.deepEqual(c.categoryAccess(restricted, base), { see: true, reply: false, create: false })
  assert.deepEqual(c.categoryAccess(restricted, { ...base, groupIds: [7] }), { see: true, reply: true, create: true })
  assert.deepEqual(c.categoryAccess(restricted, { ...base, groupIds: [2] }), { see: false, reply: false, create: false })
  assert.deepEqual(c.categoryAccess({ access: 'MEMBERS', locked: false }, base), { see: false, reply: false, create: false })
  assert.deepEqual(c.categoryAccess({ access: 'MEMBERS', locked: false }, { ...base, member: true }), { see: true, reply: true, create: true })
  assert.deepEqual(c.categoryAccess({ access: 'PUBLIC', locked: true }, base), { see: true, reply: true, create: false })
  assert.deepEqual(c.categoryAccess({ access: 'PUBLIC', locked: true }, { ...base, moderator: true }), { see: true, reply: true, create: true })
  assert.deepEqual(c.categoryAccess({ access: 'PUBLIC', locked: false }, c.GUEST), { see: true, reply: false, create: false })
  assert.deepEqual(c.categoryAccess({ access: 'PUBLIC', locked: false }, { ...base, silenced: true }), { see: true, reply: false, create: false })
  assert.deepEqual(c.automaticGroups({ loggedIn: true, trustLevel: 2, member: true, staff: false }), ['everyone', 'trust_level_0', 'trust_level_1', 'trust_level_2', 'vip'])
  assert.deepEqual(c.automaticGroups({ loggedIn: false, trustLevel: 0, member: false, staff: false }), ['everyone'])
})

test('trust levels promote step by step, never demote, and respect locks', () => {
  const s = c.DEFAULT_FORUM_SETTINGS
  const stats = { daysVisited: 12, topicsEntered: 25, postCount: 5, topicCount: 1, likesGiven: 2, likesReceived: 3, solvedCount: 0 }
  assert.equal(c.computeTrustLevel(0, stats, s), 2)
  assert.equal(c.computeTrustLevel(0, { ...stats, daysVisited: 0 }, s), 0)
  assert.equal(c.computeTrustLevel(3, { ...stats, daysVisited: 0 }, s), 3)
  assert.equal(c.computeTrustLevel(0, stats, s, true), 0)
  assert.deepEqual(c.postLimits(0, s), { images: false, links: true, maxLinks: 2 })
  assert.equal(c.postLimits(1, s).images, true)
  const custom = c.normalizeForumSettings({ flagHideWeight: 999, reactions: ['clap', 'nope'], trust: { 1: { daysVisited: 3 } } })
  assert.equal(custom.flagHideWeight, 50)
  assert.deepEqual(custom.reactions, ['heart', 'clap'])
  assert.equal(custom.trust[1].daysVisited, 3)
  assert.equal(custom.trust[1].topicsEntered, s.trust[1].topicsEntered)
})

test('badge rules, usernames, tags and flags', () => {
  const facts = { daysVisited: 1, topicsEntered: 1, postCount: 3, topicCount: 1, likesGiven: 0, likesReceived: 1, solvedCount: 1, trustLevel: 1, bestPostLikes: 12, hasAvatar: true, hasBio: true, memberDays: 10 }
  assert.deepEqual(c.earnedBadgeRules(facts), ['first_topic', 'first_reply', 'first_like_received', 'autobiographer', 'nice_post', 'first_solution', 'trust_level_1'])
  assert.equal(c.normalizeUsername('@Ali_Reza'), 'ali_reza')
  assert.throws(() => c.normalizeUsername('ab'), c.CommunityError)
  assert.throws(() => c.normalizeUsername('admin'), c.CommunityError)
  assert.throws(() => c.normalizeUsername('علی'), c.CommunityError)
  assert.equal(c.usernameSeed({ email: 'Sara.Ahmadi@mail.ir' }), 'sara_ahmadi')
  assert.equal(c.usernameSeed({ email: '989121234567@phone.mobocom.local', name: '' }), 'user')
  assert.deepEqual(c.normalizeTags('#ویندوز، Android  android, a, کرک شده, x!y', 4), ['ویندوز', 'android', 'کرک', 'شده'])
  assert.deepEqual(c.normalizeTags(['a1', 'b2', 'c3'], 2), ['a1', 'b2'])
  assert.equal(c.normalizeFlagReason('HACK'), 'OTHER')
  assert.equal(c.flagWeight(3, false), 2)
  assert.equal(c.normalizeNotificationLevel('LOUD'), 'NORMAL')
  assert.equal(c.relativeTime(new Date(Date.now() - 5 * 60_000)), '۵ دقیقه')
})
