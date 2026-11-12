// «پخش در برنامهٔ دیگر» (media/domain/external-players): the launch addresses for KMPlayer, MX Player and VLC on each
// kind of device, the address they are given, and the owner's choice of apps.
const { test } = require('node:test'), assert = require('node:assert/strict'), loadSource = require('./connected-source-loader.cjs')
const apps = loadSource()('src/modules/media/domain/external-players.ts')
const { normalizeCinemaSettings } = loadSource()('src/modules/cinema/domain/cinema.ts')

const ORIGIN = 'https://site.example'
const FILE = 'https://dl.example/Movie/The.Odyssey.2026/The Odyssey.2026.1080p.mkv?v=79&t=a%2Fb#frag'

test('external players: the device from its browser, the file as an absolute address without its fragment', () => {
  assert.equal(apps.devicePlatform('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'), 'android')
  assert.equal(apps.devicePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'), 'ios')
  assert.equal(apps.devicePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 5), 'ios', 'an iPad that says Mac')
  assert.equal(apps.devicePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 0), 'other')
  assert.equal(apps.devicePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140'), 'other')
  assert.equal(apps.playableAddress('/dl/abc/Film.mkv', ORIGIN), 'https://site.example/dl/abc/Film.mkv', 'the site\'s masked address made absolute')
  assert.equal(apps.playableAddress(FILE, ORIGIN), FILE.replace('#frag', '').replace(' ', '%20'), 'a space is written as %20 for the app')
  assert.equal(apps.playableAddress('javascript:alert(1)', ORIGIN), '')
  assert.equal(apps.playableAddress('ftp://x/y', ORIGIN), '')
})

test('external players: Android intents per app with its Play Store page; VLC also gets the subtitle', () => {
  const links = apps.externalPlayerLinks({ src: FILE, origin: ORIGIN, platform: 'android', players: ['kmplayer', 'mxplayer', 'vlc'], title: 'The Odyssey; 2026', subtitle: '/api/media/subtitle/found/7?t=x' })
  assert.deepEqual(links.map(l => l.id), ['kmplayer', 'mxplayer', 'vlc'])
  const km = links[0].href
  assert.ok(km.startsWith('intent://dl.example/Movie/The.Odyssey.2026/The%20Odyssey.2026.1080p.mkv?v=79&t=a%2Fb#Intent;'), km)
  assert.match(km, /;scheme=https;/); assert.match(km, /;type=video\/\*;/); assert.match(km, /;package=com\.kmplayer;/)
  assert.match(km, /;S\.title=The%20Odyssey%3B%202026;/, 'a ; in the title cannot end the intent early')
  assert.match(km, /;S\.browser_fallback_url=https%3A%2F%2Fplay\.google\.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom\.kmplayer;end$/)
  assert.ok(!km.includes('subtitles_location'), 'only VLC takes a subtitle address')
  assert.match(links[1].href, /;package=com\.mxtech\.videoplayer\.ad;/)
  assert.match(links[2].href, /;package=org\.videolan\.vlc;.*S\.subtitles_location=https%3A%2F%2Fsite\.example%2Fapi%2Fmedia%2Fsubtitle%2Ffound%2F7%3Ft%3Dx;/)
  assert.ok(!links.some(l => l.href.includes('#frag')))
})

test('external players: VLC on iOS through its stream address; nothing on a computer (the address is copied); the owner\'s choice', () => {
  const ios = apps.externalPlayerLinks({ src: '/dl/abc/Film.mkv', origin: ORIGIN, platform: 'ios', players: ['kmplayer', 'mxplayer', 'vlc'], subtitle: '/api/media/subtitle/3' })
  assert.deepEqual(ios, [{ id: 'vlc', label: 'VLC', href: 'vlc-x-callback://x-callback-url/stream?url=https%3A%2F%2Fsite.example%2Fdl%2Fabc%2FFilm.mkv&sub=https%3A%2F%2Fsite.example%2Fapi%2Fmedia%2Fsubtitle%2F3' }])
  assert.deepEqual(apps.externalPlayerLinks({ src: FILE, origin: ORIGIN, platform: 'ios', players: ['kmplayer'] }), [], 'no KMPlayer link is documented for iOS')
  assert.deepEqual(apps.externalPlayerLinks({ src: FILE, origin: ORIGIN, platform: 'other', players: ['kmplayer', 'vlc'] }), [])
  assert.deepEqual(apps.externalPlayerLinks({ src: FILE, origin: ORIGIN, platform: 'android', players: ['vlc'] }).map(l => l.id), ['vlc'])
  assert.deepEqual(apps.externalPlayerIds(undefined), ['kmplayer', 'mxplayer', 'vlc'], 'all three until the owner chooses')
  assert.deepEqual(apps.externalPlayerIds(['vlc', 'evil', 'kmplayer', 'vlc']), ['kmplayer', 'vlc'], 'known apps once, in the list\'s order')
  assert.deepEqual(apps.externalPlayerIds([]), [], 'none: the row is hidden')
  assert.deepEqual(normalizeCinemaSettings({}).externalPlayers, ['kmplayer', 'mxplayer', 'vlc'])
  assert.deepEqual(normalizeCinemaSettings({ externalPlayers: ['mxplayer'] }).externalPlayers, ['mxplayer'])
})
