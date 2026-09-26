import { NextResponse } from 'next/server'
import { db } from '@/platform/database/prisma'
import { canAccess } from '@/modules/membership/domain/membership'
import { getViewer } from '@/modules/membership/server/membership'
import { getModuleSettings, isModuleEnabled } from '@/extensions/server/modules'

/**
 * Protected media redirects. Download/stream URLs are stored server-side only; the
 * public site links to these endpoints, which check VIP access and count usage.
 */

const OWNER_MODULE: Record<string, string> = { title: 'cinema', episode: 'cinema', game: 'games', software: 'software' }

function denied(request: Request, reason: 'login' | 'vip', wantsJson: boolean) {
  const status = reason === 'login' ? 401 : 403
  const body = { error: reason === 'login' ? 'LOGIN_REQUIRED' : 'MEMBERS_ONLY', upgradeUrl: '/vip', loginUrl: '/login' }
  if (wantsJson) return NextResponse.json(body, { status })
  const target = new URL(reason === 'login' ? '/login' : '/vip', request.url)
  if (reason === 'login') target.searchParams.set('next', request.headers.get('referer') ? new URL(request.headers.get('referer') as string).pathname : '/')
  else target.searchParams.set('from', 'media')
  return NextResponse.redirect(target, 303)
}

function wantsJson(request: Request) {
  return (request.headers.get('accept') || '').includes('application/json')
}

async function ownerAccess(ownerType: string, ownerId: number): Promise<string | null> {
  if (ownerType === 'title') return (await db.cinemaTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED' }, select: { access: true } }))?.access ?? null
  if (ownerType === 'game') return (await db.gameTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED' }, select: { access: true } }))?.access ?? null
  if (ownerType === 'software') return (await db.softwareTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED' }, select: { access: true } }))?.access ?? null
  if (ownerType === 'episode') {
    const episode = await db.cinemaEpisode.findUnique({ where: { id: ownerId }, select: { access: true, season: { select: { title: { select: { access: true, status: true } } } } } })
    if (!episode || episode.season.title.status !== 'PUBLISHED') return null
    return episode.access === 'MEMBERS' || episode.season.title.access === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC'
  }
  return null
}

/** GET /api/media/link/:id → 303 to the stored URL when the viewer may use it. */
export async function openMediaLink(request: Request, rawId: string) {
  const id = Number(rawId)
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const link = await db.mediaLink.findUnique({ where: { id } }).catch(() => null)
  if (!link) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const module = OWNER_MODULE[link.ownerType]
  if (!module || !await isModuleEnabled(module)) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const parentAccess = await ownerAccess(link.ownerType, link.ownerId).catch(() => null)
  if (parentAccess === null) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const locked = link.access === 'MEMBERS' || parentAccess === 'MEMBERS'
  if (locked) {
    const viewer = await getViewer()
    if (!viewer.userId) return denied(request, 'login', wantsJson(request))
    if (!canAccess('MEMBERS', viewer.member)) return denied(request, 'vip', wantsJson(request))
  }
  await db.mediaLink.update({ where: { id }, data: { clicks: { increment: 1 } } }).catch(() => undefined)
  if (link.ownerType === 'software') await db.softwareTitle.update({ where: { id: link.ownerId }, data: { downloads: { increment: 1 } } }).catch(() => undefined)
  const response = NextResponse.redirect(link.url, 303)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

/**
 * GET /api/media/track/:id?q=hq&dl=1 → 303 to the audio file.
 * Members-only tracks need VIP; HQ and downloads follow the music module settings.
 */
export async function openTrack(request: Request, rawId: string) {
  const id = Number(rawId)
  if (!Number.isSafeInteger(id) || id <= 0 || !await isModuleEnabled('music')) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const track = await db.musicTrack.findFirst({ where: { id, status: 'PUBLISHED', publishedAt: { lte: new Date() } }, select: { id: true, audioUrl: true, audioHqUrl: true, access: true, album: { select: { access: true } } } }).catch(() => null)
  if (!track || !track.audioUrl) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const url = new URL(request.url)
  const hq = url.searchParams.get('q') === 'hq' && !!track.audioHqUrl
  const download = url.searchParams.get('dl') === '1'
  const settings = await getModuleSettings('music').catch(() => ({} as Record<string, unknown>))
  const needsVip = track.access === 'MEMBERS' || track.album?.access === 'MEMBERS'
    || (hq && settings['hq-members-only'] !== false)
    || (download && settings['download-members-only'] === true)
  const json = wantsJson(request) || url.searchParams.get('check') === '1'
  if (needsVip) {
    const viewer = await getViewer()
    if (!viewer.userId) return denied(request, 'login', json)
    if (!viewer.member) return denied(request, 'vip', json)
  }
  if (url.searchParams.get('check') === '1') return NextResponse.json({ ok: true, hq })
  await db.musicTrack.update({ where: { id }, data: download ? { downloads: { increment: 1 } } : { plays: { increment: 1 } } }).catch(() => undefined)
  const response = NextResponse.redirect(hq ? track.audioHqUrl : track.audioUrl, 303)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
