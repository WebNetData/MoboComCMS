const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}.ts`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}
const md = load('src/modules/forum/domain/markdown.ts')
const c = load('src/modules/forum/domain/community.ts')
const restriction = load('src/modules/identity/domain/restrictions.ts')
const restrictionView = load('src/modules/forum/domain/restrictions.ts')

test('independent restrictions honor start, exclusive expiry and revocation; malformed active facts fail closed', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const base = { id: 1, source: 'ADMIN', effectKey: 'forum.silence', capabilities: '["forum.participate"]', startsAt: now, expiresAt: new Date(now.getTime() + 1000), revokedAt: null }
  assert.equal(restriction.restrictionActive(base, now), true)
  assert.equal(restriction.restrictionActive(base, base.expiresAt), false)
  assert.equal(restriction.restrictionActive({ ...base, startsAt: new Date(now.getTime() + 1) }, now), false)
  assert.equal(restriction.restrictionActive({ ...base, revokedAt: now }, now), false)
  assert.deepEqual([...restriction.deniedCapabilities([{ ...base, revokedAt: now }, { ...base, id: 2 }], now)], ['forum.participate'])
  for (const capabilities of ['bad', '{}', '[]', '[1]', '["login"]']) assert.throws(() => restriction.deniedCapabilities([{ ...base, capabilities }], now), error => error.status === 503)
  const view = { startsAt: now.toISOString(), expiresAt: base.expiresAt.toISOString(), revokedAt: null }
  assert.equal(restrictionView.forumRestrictionStatus(view, now.getTime()), 'active')
  assert.equal(restrictionView.forumRestrictionStatus(view, base.expiresAt.getTime()), 'expired')
  assert.equal(restrictionView.forumRestrictionStatus(view, now.getTime() - 1), 'scheduled')
  assert.equal(restrictionView.forumRestrictionStatus({ ...view, revokedAt: now.toISOString() }), 'revoked')
})

test('explicit participation denial outranks staff or category grants while preserving legacy exemptions and reads', () => {
  const category = { access: 'PUBLIC', locked: false }
  const moderator = { ...c.GUEST, userId: 5, moderator: true, silenced: true }
  assert.deepEqual(c.categoryAccess(category, moderator), { see: true, reply: true, create: true })
  assert.deepEqual(c.categoryAccess(category, { ...moderator, participationDenied: true }), { see: true, reply: false, create: false })
  assert.equal(c.canEditPost({ userId: 5, createdAt: new Date() }, { ...moderator, participationDenied: true }, 24), false)
})

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
  assert.match(html, /<code>a&lt;b&gt;<\/code> <strong>b<\/strong> <em>i<\/em> <del>s<\/del> 🔥 <a class="fr-mention" href="\/u\/sara_1">@Sara_1<\/a> snake_case_word/)
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

test('a member has one address; the old forum address leads into it', () => {
  const address = load('src/modules/identity/domain/profile-address.ts')
  assert.deepEqual([address.profileAddress('sara'), address.profileAddress('sara', 'summary'), address.profileAddress('sara', 'badges'), address.profileAddress('a b')], ['/u/sara', '/u/sara?tab=forum', '/u/sara?tab=forum&f=badges', '/u/a%20b'])
  assert.deepEqual(['', 'activity', 'topics', 'badges', 'posts', 'followers', 'following', 'nonsense'].map((tab) => address.forumAddressTarget('sara', tab)),
    ['/u/sara?tab=forum', '/u/sara?tab=forum&f=activity', '/u/sara?tab=forum&f=topics', '/u/sara?tab=forum&f=badges', '/u/sara?tab=posts', '/u/sara?tab=followers', '/u/sara?tab=following', '/u/sara?tab=forum'])
  assert.equal(address.normalizeForumPiece('summary<script>'), 'summary')
  // The way back while social profiles are off: the forum's own page at the piece asked for.
  assert.deepEqual([['sara'], ['sara', 'forum'], ['sara', 'forum', 'badges'], ['sara', 'posts', 'badges'], ['sara', 'forum', '<x>'], ['a b', 'forum', 'topics']].map((args) => address.forumStandInAddress(...args)),
    ['/forum/u/sara', '/forum/u/sara', '/forum/u/sara?tab=badges', '/forum/u/sara', '/forum/u/sara', '/forum/u/a%20b?tab=topics'])
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  // The forum's own page stands in only while social profiles are off; the profile page takes the forum as a part.
  assert.match(read('src/app/forum/u/[username]/page.tsx'), /isModuleEnabled\('community'\)[^\n]*permanentRedirect\(forumAddressTarget\(username, tab\)\)/)
  assert.match(read('src/app/u/[username]/page.tsx'), /forum \? \{ key: FORUM_PART/)
  assert.match(read('src/app/u/[username]/page.tsx'), /if \(!community \|\| !await profileByUsername\(username\)[^\n]*\{\s*if \(forum\) redirect\(forumStandInAddress\(username, tab, f\)\)/, 'the address hands over to the forum page only without a social profile')
  // Links inside the forum name the one address directly instead of arriving by the redirect (its edit page stays).
  for (const file of ['src/components/forum/TopicView.tsx', 'src/components/forum/TopicList.tsx', 'src/components/forum/shared.tsx', 'src/modules/forum/domain/markdown.ts', 'src/modules/forum/server/stream.ts', 'src/modules/forum/server/community.ts']) assert.doesNotMatch(read(file), /\/forum\/u\//, file)
  assert.match(read('src/modules/community/server/pages/profile.tsx'), /if \(!visible\) \{[\s\S]*?\} else if \(onPart\) \{/, 'a private profile does not show the forum part either')
})

const sourceOf = (relative) => fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8')

test('a member\'s level is the last one whose every threshold they meet', () => {
  const levels = c.normalizeLevels([
    { id: 'new', name: 'عضو تازه', minPosts: 0 }, { id: 'active', name: 'کاربر فعال', minPosts: 50, color: '#0EA5E9' },
    { id: 'helpful', name: 'کاربر مفید', minPosts: 50, minLikes: 100 }, { id: 'prof', name: 'پروفسور', minPosts: 200, minLikes: 500 }, { name: '' }, { id: 'active', name: 'تکراری' },
  ])
  assert.deepEqual(levels.map((level) => level.id), ['new', 'active', 'helpful', 'prof', 'activex'], 'a nameless level is dropped and a repeated id is told apart')
  assert.equal(levels[1].color, '#0ea5e9')
  const at = (posts, likes) => c.levelFor(levels.slice(0, 4), { posts, likes, reputation: 0 })?.name
  assert.equal(at(3, 0), 'عضو تازه')
  assert.equal(at(60, 20), 'کاربر فعال')
  assert.equal(at(60, 150), 'کاربر مفید')
  assert.equal(at(10, 5000), 'عضو تازه', 'likes alone do not reach a level that also asks for posts')
  assert.equal(at(400, 900), 'پروفسور')
  assert.equal(c.levelFor([], { posts: 9, likes: 9, reputation: 9 }), null)
  // Stored settings from before levels existed read with the defaults; an empty list is kept empty.
  assert.equal(c.normalizeForumSettings({}).levels.length, c.DEFAULT_LEVELS.length)
  assert.deepEqual(c.normalizeForumSettings({ levels: [] }).levels, [])
  // Levels are worked out when an author is read, so they hold for every member at once.
  assert.match(sourceOf('src/modules/forum/server/forum.ts'), /const level = levelFor\(levels, \{ posts: profile\?\.postCount \?\? 0, likes: profile\?\.likesReceived \?\? 0, reputation: profile\?\.reputation \?\? 0 \}\)/)
})

test('a badge may be given at a number the admin chooses', () => {
  assert.deepEqual(c.parseThresholdRule('posts:100'), { metric: 'posts', value: 100 })
  assert.deepEqual(c.parseThresholdRule('likes:500'), { metric: 'likes', value: 500 })
  for (const bad of ['posts:0', 'posts:-5', 'posts:abc', 'karma:10', 'posts:10; drop', 'posts:1e3', '']) assert.equal(c.parseThresholdRule(bad), null, bad)
  assert.equal(c.validBadgeRule('posts:100'), true)
  assert.equal(c.validBadgeRule('first_topic'), true)
  assert.equal(c.validBadgeRule('posts:x'), false)
  const facts = { daysVisited: 1, topicsEntered: 1, postCount: 120, topicCount: 7, likesGiven: 0, likesReceived: 40, solvedCount: 2, trustLevel: 1, bestPostLikes: 0, hasAvatar: false, hasBio: false, memberDays: 30, reputation: 55 }
  assert.equal(c.thresholdMet('posts:100', facts), true)
  assert.equal(c.thresholdMet('posts:121', facts), false)
  assert.equal(c.thresholdMet('likes:40', facts), true)
  assert.equal(c.thresholdMet('reputation:56', facts), false)
  assert.equal(c.thresholdMet('topics:7', facts), true)
  assert.equal(c.thresholdMet('solved:3', facts), false)
  assert.equal(c.thresholdMet('days:30', facts), true)
  assert.equal(c.thresholdMet('first_topic', facts), false)
  for (const rule of c.BADGE_RULES) assert.ok(c.BADGE_RULE_LABEL[rule], rule)
  const server = sourceOf('src/modules/forum/server/community.ts'), admin = sourceOf('src/modules/forum/server/http/admin.ts')
  assert.match(server, /const badges = open\.filter\(\(badge\) => rules\.includes\(badge\.rule\) \|\| thresholdMet\(badge\.rule, facts\)\)/)
  // Saving such a badge measures the number over everything stored, not only from now on.
  assert.match(server, /export async function grantThresholdBadgeToAll\(badgeId: number\)/)
  assert.match(admin, /const given = await grantThresholdBadgeToAll\(saved\.id\)/)
  assert.match(admin, /rule: validBadgeRule\(rule\) \? rule : ''/)
})

test('a role\'s slug and titles can be changed, within limits', () => {
  const route = sourceOf('src/modules/identity/server/http/admin/roles/route.ts')
  assert.match(route, /const ROLE_SLUG = \/\^\[a-z\]\[a-z0-9-\]\{1,39\}\$\//)
  assert.match(route, /if \(role\.isSystem \|\| FIXED_SLUGS\.includes\(role\.name\)\) return err\(/)
  assert.match(route, /if \(!ROLE_SLUG\.test\(name\) \|\| FIXED_SLUGS\.includes\(name\)\) return err\(/)
  assert.match(route, /if \(await db\.role\.findUnique\(\{ where: \{ name \}, select: \{ id: true \} \}\)\) return err\('نقش دیگری همین نامک را دارد', 409\)/)
  // The limits on who may shape a role still stand in front of the rename.
  assert.ok(route.indexOf('const refusal = roleRefusal(admin, role.permissions, id)') < route.indexOf('db.role.update({ where: { id }, data })'))
})
