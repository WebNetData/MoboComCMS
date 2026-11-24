const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const source = require('./connected-source-loader.cjs')

assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'Use a disposable test/check database')
const db = new PrismaClient(), stamp = `playlist-audience-${randomUUID()}`
const load = source({ '@/platform/database/prisma': { db }, react: { ...require('react'), cache: fn => fn } })
const playlists = load('src/modules/music/server/personal-playlists.ts')
const ids = { users: [], artist: null, group: null }

async function main() {
  const allowed = await db.user.create({ data: { email: `${stamp}-allowed@example.test`, passwordHash: 'fixture' } })
  ids.users.push(allowed.id)
  const other = await db.user.create({ data: { email: `${stamp}-other@example.test`, passwordHash: 'fixture' } })
  ids.users.push(other.id)
  const group = await db.userGroup.create({ data: { name: stamp } }); ids.group = group.id
  await db.userGroupMember.create({ data: { groupId: group.id, userId: allowed.id } })
  const artist = await db.musicArtist.create({ data: { slug: stamp, name: stamp } }); ids.artist = artist.id
  const album = await db.musicAlbum.create({ data: { slug: stamp, title: stamp, artistId: artist.id } })
  const track = await db.musicTrack.create({ data: { slug: stamp, title: stamp, artistId: artist.id, albumId: album.id, publishedAt: new Date(Date.now() - 60000) } })
  const a = await playlists.createPersonalPlaylist(allowed.id, stamp), b = await playlists.createPersonalPlaylist(other.id, stamp)
  await playlists.addPersonalTrack(allowed.id, a.id, track.id)
  await playlists.addPersonalTrack(other.id, b.id, track.id)
  async function expectVisible(user, playlist, visible) {
    const list = await playlists.listPersonalPlaylists(user.id)
    assert.equal(list.find(row => row.id === playlist.id).trackCount, visible ? 1 : 0)
    const detail = await playlists.getPersonalPlaylist(user.id, playlist.id)
    assert.equal(detail.tracks.length, visible ? 1 : 0)
    if (visible) assert.equal(detail.tracks[0].id, track.id)
  }
  async function both(aVisible, bVisible) { await expectVisible(allowed, a, aVisible); await expectVisible(other, b, bVisible) }
  const restricted = JSON.stringify([`group:${group.id}`])
  await both(true, true)
  await db.musicTrack.update({ where: { id: track.id }, data: { audienceGroups: restricted } })
  await both(true, false)
  const restrictedPlaylist = await playlists.createPersonalPlaylist(allowed.id, `${stamp}-restricted`)
  await assert.rejects(() => playlists.addPersonalTrack(allowed.id, restrictedPlaylist.id, track.id), error => error.status === 404)
  await db.musicTrack.update({ where: { id: track.id }, data: { audienceGroups: '' } })
  await db.musicAlbum.update({ where: { id: album.id }, data: { audienceGroups: restricted } })
  await both(true, false)
  await assert.rejects(() => playlists.addPersonalTrack(allowed.id, restrictedPlaylist.id, track.id), error => error.status === 404)
  await db.musicTrack.update({ where: { id: track.id }, data: { audienceGroups: restricted } })
  await both(true, false)
  await db.musicAlbum.update({ where: { id: album.id }, data: { audienceGroups: '' } })
  await db.musicTrack.update({ where: { id: track.id }, data: { audienceGroups: '', status: 'DRAFT' } })
  await both(false, false)
  await db.musicTrack.update({ where: { id: track.id }, data: { status: 'PUBLISHED', publishedAt: new Date(Date.now() + 3600000) } })
  await both(false, false)
  assert.equal(await db.userMusicPlaylistTrack.count({ where: { trackId: track.id } }), 2)
  await db.musicTrack.update({ where: { id: track.id }, data: { publishedAt: new Date(Date.now() - 60000) } })
  await both(true, true)
  await assert.rejects(() => playlists.getPersonalPlaylist(other.id, a.id), error => error.status === 404)
  await assert.rejects(() => playlists.addPersonalTrack(other.id, a.id, track.id), error => error.status === 404)
  console.log('playlist audience connected checks passed')
}

main().finally(async () => {
  if (ids.users.length) await db.user.deleteMany({ where: { id: { in: ids.users } } })
  if (ids.artist) await db.musicArtist.delete({ where: { id: ids.artist } })
  if (ids.group) await db.userGroup.delete({ where: { id: ids.group } })
  await db.$disconnect()
}).catch(error => { console.error(error); process.exitCode = 1 })
