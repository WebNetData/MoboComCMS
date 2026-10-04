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

function messageService({ blocked = [], enabled = true } = {}) {
  const state = { writes: 0, notifications: 0 }
  const db = {
    forumConversationUser: { findUnique: async () => ({ left: false, conversation: { id: 9, title: 'Conversation' } }), findMany: async () => [{ userId: 2 }] },
    forumProfile: { findUnique: async () => ({ username: 'sender' }), findMany: async () => [{ userId: 2, username: 'recipient' }] },
    userProfile: { findMany: async () => [{ userId: 2, username: 'recipient', privacy: '{}' }] },
    forumGroup: { findMany: async () => [{ name: 'Members', mentionable: true, members: [{ userId: 2 }] }] },
    $transaction: async fn => {
      state.writes++
      return fn({
        forumConversation: { update: async () => ({ postCount: 2 }), create: async () => ({ id: 9 }) },
        forumMessage: { create: async ({ data }) => ({ id: 8, number: data.number }) },
        forumConversationUser: { update: async () => ({}), updateMany: async () => ({}), createMany: async () => ({}) },
      })
    },
  }
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/platform/http/rate-limit': { rateLimitHit: () => ({ ok: true }) },
    '@/modules/forum/server/community': { getForumSettings: async () => ({ ...c.DEFAULT_FORUM_SETTINGS, messagesEnabled: enabled }), notify: async () => { state.notifications++ } },
    '@/modules/forum/server/forum': {},
    '@/modules/forum/server/message-counts': { unreadMessageCount: async () => 0 },
    '@/modules/identity/server/profile': { blockedIds: async () => blocked, relationBetween: async () => ({ self: false, signedIn: true, following: false, followedBy: false, blocked: false, blockedBy: false, staff: false }) },
  }
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/modules/forum/server/messages.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`) : require(name), mod, mod.exports)
  return { service: mod.exports, state }
}
const sender = { userId: 1, moderator: false, trustLevel: 2, silenced: false, suspended: false }

test('shared unread count preserves guest, membership/archive filters and read-position semantics', async () => {
  let queries = 0
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/modules/forum/server/message-counts.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(name => {
    assert.equal(name, '@/platform/database/prisma')
    return { db: { forumConversationUser: { findMany: async ({ where }) => { queries++; assert.deepEqual(where, { userId: 1, left: false, archived: false }); return [{ lastRead: 0, conversation: { postCount: 1 } }, { lastRead: 2, conversation: { postCount: 2 } }, { lastRead: 4, conversation: { postCount: 2 } }] } } } }
  }, mod, mod.exports)
  assert.equal(await mod.exports.unreadMessageCount(null), 0); assert.equal(queries, 0)
  assert.equal(await mod.exports.unreadMessageCount(1), 1)
  assert.equal(typeof messageService().service.unreadMessageCount, 'function', 'legacy message-module export remains')
})

test('existing replies honor blocks and the Admin message pause before writes or notifications', async () => {
  for (const config of [{ blocked: [2] }, { enabled: false }]) {
    const { service, state } = messageService(config)
    await assert.rejects(service.replyConversation(sender, 9, { content: 'A valid private reply' }), error => error.status === 403)
    assert.deepEqual(state, { writes: 0, notifications: 0 })
  }
})

test('group recipients cannot bypass member blocks', async () => {
  const { service, state } = messageService({ blocked: [2] })
  await assert.rejects(service.startConversation(sender, { groups: ['members'], title: 'Valid group title', content: 'A valid private message' }), error => error.status === 403)
  assert.deepEqual(state, { writes: 0, notifications: 0 })
})

test('Admin message pause blocks new invitations while preserving moderator messaging', async () => {
  const paused = messageService({ enabled: false })
  await assert.rejects(paused.service.conversationAction(sender, 9, { action: 'invite', to: 'recipient' }), error => error.status === 403)
  assert.deepEqual(paused.state, { writes: 0, notifications: 0 })
  const staff = messageService({ enabled: false, blocked: [2] })
  assert.deepEqual(await staff.service.startConversation({ ...sender, moderator: true }, { groups: ['members'], title: 'Valid group title', content: 'A valid private message' }), { id: 9 })
  assert.deepEqual(staff.state, { writes: 1, notifications: 1 })
})

test('unblocked existing participants and the established moderator exemption can still reply', async () => {
  for (const scenario of [
    { config: {}, viewer: { ...sender, trustLevel: 0 } },
    { config: { blocked: [2], enabled: false }, viewer: { ...sender, moderator: true } },
  ]) {
    const { service, state } = messageService(scenario.config)
    assert.deepEqual(await service.replyConversation(scenario.viewer, 9, { content: 'A valid private reply' }), { id: 8, number: 2 })
    assert.deepEqual(state, { writes: 1, notifications: 1 })
  }
})

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
