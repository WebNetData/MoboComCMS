const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(relative, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => mocks[name] || (name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`, mocks) : require(name)), mod, mod.exports)
  return mod.exports
}
test('Music dashboard preserves complete totals and rankings across bounded catalog/download pages', async () => {
  const now = new Date('2026-10-04T12:00:00Z'), past = new Date('2026-10-03T21:30:00Z')
  const tracks = Array.from({ length: 501 }, (_, index) => ({ id: index + 1, artistId: index + 1, slug: `track-${index}`, title: `Track ${index}`, cover: '', album: { cover: 'album.jpg' }, artist: { name: `Artist ${index}` }, audioUrl: 'a', audioHqUrl: index ? 'hq' : ' ', duration: index ? 200 : 0, lyrics: 'lyrics', genre: 'Pop', publishedAt: past, plays: index + 1, downloads: index, access: index ? 'PUBLIC' : 'MEMBERS' }))
  const artists = tracks.map(track => ({ id: track.artistId, slug: `artist-${track.artistId}`, name: track.artist.name, image: track.id === 501 ? ' ' : 'photo', _count: { tracks: 1, albums: 0 } }))
  const downloads = tracks.map(track => ({ id: track.id, createdAt: past }))
  const cursors = { tracks: [], artists: [], downloads: [] }
  const page = (rows, calls) => async ({ where, orderBy, take }) => {
    assert.equal(take, 500, 'catalog/download reads must be bounded')
    assert.deepEqual(orderBy, { id: 'asc' })
    calls.push(where.id.gt)
    return rows.filter(row => row.id > where.id.gt).slice(0, take)
  }
  const db = {
    musicTrack: { count: async ({ where }) => where.status?.not ? 2 : 3, findMany: async query => { assert.equal(query.where.status, 'PUBLISHED'); assert.equal(query.where.publishedAt.lte, now); return page(tracks, cursors.tracks)(query) } },
    musicAlbum: { count: async ({ where }) => where.status?.not ? 4 : where.tracks ? 5 : 6 },
    musicArtist: { findMany: page(artists, cursors.artists) },
    musicPlaylist: { count: async () => 7 },
    downloadLog: { findMany: async query => { assert.equal(query.where.ownerType, 'track'); assert.equal(query.where.createdAt.gte.getTime(), now.getTime() - 30 * 86400000); return page(downloads, cursors.downloads)(query) } },
  }
  const { musicDashboard } = load('src/modules/music/server/admin.ts', { '@/platform/database/prisma': { db }, '@/modules/settings/server': {} })
  const result = await musicDashboard(now)
  assert.deepEqual(cursors, { tracks: [0, 500], artists: [0, 500], downloads: [0, 500] })
  assert.deepEqual(result.kpis, { tracks: 501, albums: 6, artists: 501, playlists: 7, drafts: 6, scheduled: 3, plays: 125751, downloads: 125250, downloads30: 501, vip: 1, hq: 500, emptyAlbums: 5, artistsWithoutPhoto: 1 })
  assert.deepEqual(result.topPlayed.map(row => row.id), [501, 500, 499, 498, 497, 496, 495, 494])
  assert.deepEqual(result.topDownloaded.map(row => row.id), result.topPlayed.map(row => row.id))
  assert.deepEqual(result.topArtists.map(row => row.id), result.topPlayed.map(row => row.id))
  assert.equal(result.worst.length, 1); assert.deepEqual(result.worst[0].issues, ['hq', 'duration'])
  assert.equal(result.health.find(row => row.key === 'hq').count, 1)
  assert.equal(result.series.find(row => row.day === '2026-10-04').downloads, 501, 'Tehran midnight is preserved')
})

test('empty Music dashboard stays empty and download read failures are not presented as zero', async () => {
  const empty = { count: async () => 0, findMany: async () => [] }
  const db = { musicTrack: empty, musicAlbum: empty, musicArtist: empty, musicPlaylist: empty, downloadLog: empty }
  const { musicDashboard } = load('src/modules/music/server/admin.ts', { '@/platform/database/prisma': { db }, '@/modules/settings/server': {} })
  const result = await musicDashboard()
  assert.ok(Object.values(result.kpis).every(value => value === 0))
  for (const key of ['health', 'worst', 'topPlayed', 'topDownloaded', 'topArtists']) assert.deepEqual(result[key], [])
  db.downloadLog = { findMany: async () => { throw new Error('database read failed') } }
  await assert.rejects(musicDashboard(), /database read failed/)
})

test('the music section: as wide as the header, a player drawn with icons, and a queue that says where the listener is', () => {
  const fs = require('node:fs'), path = require('node:path')
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
  const player = read('src/components/media/MusicPlayer.tsx'), css = read('src/app/media-design.css')
  // Controls are shapes: a text glyph is painted differently (or as an emoji) by every device.
  assert.doesNotMatch(player, /[⤮⏮⏭☰⤓✕♪]|❚❚|🔁|🔂|'▶'/u, 'no control of the player is a text glyph')
  for (const name of ['play', 'pause', 'prev', 'next', 'shuffle', 'repeat', 'repeatOne', 'queue', 'download', 'close', 'note']) assert.match(player, new RegExp('\n  ' + name + ': <'), 'icon ' + name)
  for (const used of [...player.matchAll(/PlayerIcon name="(\w+)"/g)].map((m) => m[1])) assert.match(player, new RegExp('\n  ' + used + ': <'), 'icon ' + used + ' is defined')
  // The queue: which track of how many, a number per track (the playing one moves), and its own close button.
  assert.match(player, /\$\{\(index \+ 1\)\.toLocaleString\('fa-IR'\)\} از \$\{queue\.length\.toLocaleString\('fa-IR'\)\} آهنگ/)
  assert.match(player, /className=\{i === index \? 'is-current' : i < index \? 'is-played' : ''\}/)
  assert.match(player, /aria-current=\{i === index \? 'true' : undefined\}/)
  assert.match(player, /onClick=\{\(\) => setShowQueue\(false\)\} aria-label=\{fa \? 'بستن صف پخش' : 'Close queue'\}/)
  // The bar is lit by the cover of what is playing, and stops moving for listeners who ask for less motion.
  assert.match(player, /className="mu-player-glow" aria-hidden="true" style=\{\{ backgroundImage: `url\("\$\{encodeURI\(current\.cover\)\}"\)` \}\}/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.mu-pb\.is-playing, \.mu-player\[data-playing\] \.mu-play-main, \.mu-player\[data-playing\] \.mu-player-glow::before, \.mu-queue \{ animation: none; \}/)
  // The whole section takes the width of the site header; the section bar keeps its own box.
  assert.match(css, /\.md-music \.container:not\(\.mm-bar\) \{ width: var\(--mb-chrome, min\(1680px, 100% - 48px\)\); max-width: none;/)
  assert.match(css, /\.mu-player \{ inset-inline: max\(16px, calc\(\(100% - var\(--mb-chrome, 100%\)\) \/ 2\)\);/)
})
