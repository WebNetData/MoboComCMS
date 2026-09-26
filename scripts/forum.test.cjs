const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const forum = load('src/modules/forum/domain/forum.ts')

test('forum posts render as escaped text with safe links and quotes', () => {
  const html = forum.renderPostText('> quoted <b>x</b>\nhello <script>alert(1)</script> https://example.org/a?b=1&c=2.\n"><img src=x onerror=alert(1)> javascript:alert(1)')
  assert.doesNotMatch(html, /<script|<img|<b>/)
  assert.match(html, /<blockquote>quoted &lt;b&gt;x&lt;\/b&gt;<\/blockquote>/)
  assert.match(html, /<a href="https:\/\/example\.org\/a\?b=1&amp;c=2" target="_blank" rel="nofollow ugc noopener noreferrer">/)
  assert.doesNotMatch(html, /href="javascript/)
})

test('titles and messages are trimmed, bounded and stripped of invisible characters', () => {
  assert.equal(forum.cleanTitle('  سلام   دنیا ‮ ok '), 'سلام دنیا ok')
  assert.throws(() => forum.cleanTitle('abc'), forum.ForumError)
  assert.throws(() => forum.cleanTitle('x'.repeat(151)), forum.ForumError)
  assert.equal(forum.cleanContent('a\r\n\r\n\r\n\r\n\r\nb'), 'a\n\n\nb')
  assert.throws(() => forum.cleanContent(' '), forum.ForumError)
  assert.throws(() => forum.cleanContent('x'.repeat(20001)), forum.ForumError)
})

test('board and thread permissions follow VIP, lock and moderator rules', () => {
  const guest = { userId: null, member: false, moderator: false }
  const user = { userId: 7, member: false, moderator: false }
  const vip = { userId: 8, member: true, moderator: false }
  const mod = { userId: 1, member: false, moderator: true }
  assert.equal(forum.canRead('MEMBERS', user), false)
  assert.equal(forum.canRead('MEMBERS', vip), true)
  assert.equal(forum.canRead('MEMBERS', mod), true)
  assert.equal(forum.canStartThread({ access: 'PUBLIC', locked: false }, guest), false)
  assert.equal(forum.canStartThread({ access: 'PUBLIC', locked: true }, user), false)
  assert.equal(forum.canStartThread({ access: 'PUBLIC', locked: true }, mod), true)
  assert.equal(forum.canReply({ locked: true, status: 'VISIBLE' }, { access: 'PUBLIC' }, user), false)
  assert.equal(forum.canReply({ locked: false, status: 'HIDDEN' }, { access: 'PUBLIC' }, user), false)
  assert.equal(forum.canReply({ locked: false, status: 'VISIBLE' }, { access: 'MEMBERS' }, vip), true)
  const now = Date.now()
  assert.equal(forum.canEdit({ userId: 7, createdAt: new Date(now - 1000) }, user, now), true)
  assert.equal(forum.canEdit({ userId: 7, createdAt: new Date(now - forum.EDIT_WINDOW_MS - 1) }, user, now), false)
  assert.equal(forum.canEdit({ userId: 9, createdAt: new Date(now) }, user, now), false)
  assert.equal(forum.canEdit({ userId: 9, createdAt: new Date(0) }, mod, now), true)
})

test('board slugs are normalized', () => {
  assert.equal(forum.boardSlug(' VIP Lounge!! '), 'vip-lounge')
  assert.throws(() => forum.boardSlug('سلام'), forum.ForumError)
})
