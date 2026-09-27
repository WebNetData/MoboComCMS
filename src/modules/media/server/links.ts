import { NextResponse } from 'next/server'
import { db } from '@/platform/database/prisma'
import { canAccess } from '@/modules/membership/domain/membership'
import { getViewer } from '@/modules/membership/server/membership'
import { getModuleSettings, isModuleEnabled } from '@/extensions/server/modules'
import {
  checkPageToken, downloadGuardEnabled, downloaderOf, getDownloadSettings, logDownload, remainingDownloads, signOriginUrl, trackDownloadHref,
} from '@/modules/downloads/server/guard'

/**
 * Protected media redirects. Download/stream URLs are stored server-side only; the
 * public site links to these endpoints, which check VIP access, the signed page
 * token and the daily quota (download protection module), count usage and
 * redirect to the — optionally signed, expiring — file URL.
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

/** Back to the item page with a notice (expired link, quota reached, removed file). */
function backToItem(request: Request, path: string, notice: 'expired' | 'limit' | 'removed', json: boolean) {
  const status = notice === 'removed' ? 410 : notice === 'limit' ? 429 : 403
  if (json) return NextResponse.json({ error: notice === 'expired' ? 'LINK_EXPIRED' : notice === 'limit' ? 'DAILY_LIMIT' : 'LINK_REMOVED', page: path }, { status })
  const target = new URL(path, request.url)
  target.searchParams.set('dl', notice)
  target.hash = 'downloads'
  return NextResponse.redirect(target, 303)
}

function fileRedirect(url: string) {
  const response = NextResponse.redirect(url, 303)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

type Owner = { access: string; path: string }

async function ownerOf(ownerType: string, ownerId: number): Promise<Owner | null> {
  if (ownerType === 'title') {
    const row = await db.cinemaTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED' }, select: { access: true, slug: true } })
    return row && { access: row.access, path: `/cinema/${row.slug}` }
  }
  if (ownerType === 'game') {
    const row = await db.gameTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED' }, select: { access: true, slug: true } })
    return row && { access: row.access, path: `/games/${row.slug}` }
  }
  if (ownerType === 'software') {
    const row = await db.softwareTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED' }, select: { access: true, slug: true } })
    return row && { access: row.access, path: `/software/${row.slug}` }
  }
  if (ownerType === 'episode') {
    const episode = await db.cinemaEpisode.findUnique({ where: { id: ownerId }, select: { access: true, season: { select: { title: { select: { access: true, status: true, slug: true } } } } } })
    if (!episode || episode.season.title.status !== 'PUBLISHED') return null
    return { access: episode.access === 'MEMBERS' || episode.season.title.access === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC', path: `/cinema/${episode.season.title.slug}` }
  }
  return null
}

/** GET /api/media/link/:id?t=<token> → 303 to the stored URL when the viewer may use it. */
export async function openMediaLink(request: Request, rawId: string) {
  const id = Number(rawId)
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const link = await db.mediaLink.findUnique({ where: { id } }).catch(() => null)
  if (!link) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const module = OWNER_MODULE[link.ownerType]
  if (!module || !await isModuleEnabled(module)) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const owner = await ownerOf(link.ownerType, link.ownerId).catch(() => null)
  if (!owner) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const json = wantsJson(request)
  if (link.disabled) return backToItem(request, owner.path, 'removed', json)

  const viewer = await getViewer()
  if (link.access === 'MEMBERS' || owner.access === 'MEMBERS') {
    if (!viewer.userId) return denied(request, 'login', json)
    if (!canAccess('MEMBERS', viewer.member)) return denied(request, 'vip', json)
  }

  const guarded = await downloadGuardEnabled()
  const settings = guarded ? await getDownloadSettings() : null
  const who = downloaderOf(request.headers, viewer)
  if (settings) {
    if (settings.enforceTokens && checkPageToken(new URL(request.url).searchParams.get('t'), `l${id}`, viewer.userId) !== 'ok') return backToItem(request, owner.path, 'expired', json)
    if (settings.requireLogin && !viewer.userId) return denied(request, 'login', json)
    // Streams are watched in place; only downloads count towards the daily quota.
    if (link.kind === 'DOWNLOAD' && await remainingDownloads(settings, who) === 0) return backToItem(request, owner.path, 'limit', json)
  }

  await db.mediaLink.update({ where: { id }, data: { clicks: { increment: 1 } } }).catch(() => undefined)
  if (link.ownerType === 'software') await db.softwareTitle.update({ where: { id: link.ownerId }, data: { downloads: { increment: 1 } } }).catch(() => undefined)
  if (link.kind === 'DOWNLOAD') await logDownload(who, { linkId: id, ownerType: link.ownerType, ownerId: link.ownerId })
  return fileRedirect(settings ? signOriginUrl(link.url, settings, request.headers) : link.url)
}

/**
 * GET /api/media/track/:id?q=hq&dl=1 → 303 to the audio file.
 * Members-only tracks need VIP; HQ and downloads follow the music module settings.
 * Downloads (dl=1) also go through the download protection module; `issue=1`
 * returns a fresh signed download href as JSON for the site-wide player.
 */
export async function openTrack(request: Request, rawId: string) {
  const id = Number(rawId)
  if (!Number.isSafeInteger(id) || id <= 0 || !await isModuleEnabled('music')) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const track = await db.musicTrack.findFirst({ where: { id, status: 'PUBLISHED', publishedAt: { lte: new Date() } }, select: { id: true, slug: true, audioUrl: true, audioHqUrl: true, access: true, album: { select: { access: true } } } }).catch(() => null)
  if (!track || !track.audioUrl) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const url = new URL(request.url)
  const hq = url.searchParams.get('q') === 'hq' && !!track.audioHqUrl
  const download = url.searchParams.get('dl') === '1'
  const issue = download && url.searchParams.get('issue') === '1'
  const settings = await getModuleSettings('music').catch(() => ({} as Record<string, unknown>))
  const needsVip = track.access === 'MEMBERS' || track.album?.access === 'MEMBERS'
    || (hq && settings['hq-members-only'] !== false)
    || (download && settings['download-members-only'] === true)
  const json = wantsJson(request) || url.searchParams.get('check') === '1' || issue
  const viewer = await getViewer()
  if (needsVip) {
    if (!viewer.userId) return denied(request, 'login', json)
    if (!viewer.member) return denied(request, 'vip', json)
  }
  if (url.searchParams.get('check') === '1') return NextResponse.json({ ok: true, hq })
  if (issue) return NextResponse.json({ href: await trackDownloadHref(id, viewer.userId, hq) })

  let target = hq ? track.audioHqUrl : track.audioUrl
  if (download && await downloadGuardEnabled()) {
    const guard = await getDownloadSettings()
    const who = downloaderOf(request.headers, viewer)
    const page = `/music/track/${track.slug}`
    if (guard.enforceTokens && checkPageToken(url.searchParams.get('t'), `t${id}`, viewer.userId) !== 'ok') return backToItem(request, page, 'expired', json)
    if (guard.requireLogin && !viewer.userId) return denied(request, 'login', json)
    if (await remainingDownloads(guard, who) === 0) return backToItem(request, page, 'limit', json)
    await logDownload(who, { ownerType: 'track', ownerId: id })
    target = signOriginUrl(target, guard, request.headers)
  }
  await db.musicTrack.update({ where: { id }, data: download ? { downloads: { increment: 1 } } : { plays: { increment: 1 } } }).catch(() => undefined)
  return fileRedirect(target)
}
