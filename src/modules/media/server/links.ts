import { NextResponse } from 'next/server'
import { siteRedirect } from '@/platform/http/redirect'
import { db } from '@/platform/database/prisma'
import { canAccess } from '@/modules/membership/domain/membership'
import { getViewer } from '@/modules/membership/server/membership'
import { getModuleSettings, isModuleEnabled } from '@/extensions/server/modules'
import {
  checkPageToken, downloadGuardEnabled, downloaderOf, getDownloadSettings, linkHref, logDownload, remainingDownloads, signOriginUrl, trackDownloadHref,
} from '@/modules/downloads/server/guard'
import { MAX_SUBTITLE_BYTES, decodeSubtitle, playbackKind, subtitleFormat, toWebVtt, trackLanguage, trackLinks, type PlaybackKind } from '@/modules/media/domain/media'
import { maskedHref, type FileContext } from '@/modules/downloads/server/mask'
import type { FileTags } from '@/modules/downloads/server/clean'
import { toEmbedUrl } from '@/modules/site/domain/builder'
import { accessFor, type Chain } from '@/modules/paywall/server/paywall'

/**
 * Protected media redirects. Download/stream URLs are stored server-side only; the
 * public site links to these endpoints, which check VIP access, the signed page
 * token and the daily quota (download protection module), count usage and
 * redirect to the — optionally signed, expiring — file URL.
 */

const OWNER_MODULE: Record<string, string> = { title: 'cinema', episode: 'cinema', game: 'games', gameupdate: 'games', software: 'software', softwarerelease: 'software' }

/** Paid item the viewer has not bought: back to its page, at the buy box. */
function mustBuy(request: Request, path: string, json: boolean) {
  if (json) return NextResponse.json({ error: 'PURCHASE_REQUIRED', page: path }, { status: 402 })
  const target = new URL(path, request.url)
  target.hash = 'buy'
  return siteRedirect(target)
}

/**
 * Access to an item's files: a price (paywall module) replaces the plain VIP
 * gate — VIP members get it free or discounted as the admin chose; otherwise
 * members-only items need VIP.
 */
async function gate(viewer: { userId: number | null; member: boolean }, chain: Chain, vipOnly: boolean): Promise<'ok' | 'login' | 'vip' | 'buy'> {
  const paid = await accessFor(viewer, chain)
  if (paid.key) return paid.decision.open ? 'ok' : viewer.userId ? 'buy' : 'login'
  if (!vipOnly) return 'ok'
  if (!viewer.userId) return 'login'
  return canAccess('MEMBERS', viewer.member) ? 'ok' : 'vip'
}

function denied(request: Request, reason: 'login' | 'vip', wantsJson: boolean) {
  const status = reason === 'login' ? 401 : 403
  const body = { error: reason === 'login' ? 'LOGIN_REQUIRED' : 'MEMBERS_ONLY', upgradeUrl: '/vip', loginUrl: '/login' }
  if (wantsJson) return NextResponse.json(body, { status })
  const target = new URL(reason === 'login' ? '/login' : '/vip', request.url)
  if (reason === 'login') target.searchParams.set('next', request.headers.get('referer') ? new URL(request.headers.get('referer') as string).pathname : '/')
  else target.searchParams.set('from', 'media')
  return siteRedirect(target)
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
  return siteRedirect(target)
}

/** Redirect to the file — masked on this site's domain when it lives on another host. */
async function fileRedirect(request: Request, url: string, download: boolean, context?: FileContext, tags?: FileTags) {
  const response = siteRedirect(await maskedHref(url, { download, context, tags: tags || (context?.title ? { title: context.title } : undefined) }))
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

type Owner = { access: string; path: string; chain: Chain; title: string }

async function ownerOf(ownerType: string, ownerId: number): Promise<Owner | null> {
  if (ownerType === 'title') {
    const row = await db.cinemaTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED', publishedAt: { lte: new Date() } }, select: { access: true, slug: true, title: true } })
    return row && { access: row.access, path: `/cinema/${row.slug}`, chain: [{ ownerType: 'title', ownerId }], title: row.title }
  }
  if (ownerType === 'game') {
    const row = await db.gameTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED', publishedAt: { lte: new Date() } }, select: { access: true, slug: true, title: true } })
    return row && { access: row.access, path: `/games/${row.slug}`, chain: [{ ownerType: 'game', ownerId }], title: row.title }
  }
  if (ownerType === 'gameupdate') {
    const row = await db.gameUpdate.findUnique({ where: { id: ownerId }, select: { gameId: true, title: true, releasedAt: true, game: { select: { access: true, slug: true, status: true, publishedAt: true, title: true } } } })
    return row && row.releasedAt <= new Date() && row.game.status === 'PUBLISHED' && row.game.publishedAt <= new Date() ? { access: row.game.access, path: `/games/${row.game.slug}`, chain: [{ ownerType: 'game', ownerId: row.gameId }], title: `${row.game.title} ${row.title}`.trim() } : null
  }
  if (ownerType === 'software') {
    const row = await db.softwareTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED', publishedAt: { lte: new Date() } }, select: { access: true, slug: true, title: true } })
    return row && { access: row.access, path: `/software/${row.slug}`, chain: [{ ownerType: 'software', ownerId }], title: row.title }
  }
  if (ownerType === 'softwarerelease') {
    const row = await db.softwareRelease.findUnique({ where: { id: ownerId }, select: { version: true, status: true, releasedAt: true, softwareId: true, software: { select: { access: true, slug: true, status: true, publishedAt: true, title: true } } } })
    return row && row.status === 'PUBLISHED' && row.releasedAt <= new Date() && row.software.status === 'PUBLISHED' && row.software.publishedAt <= new Date() ? { access: row.software.access, path: `/software/${row.software.slug}`, chain: [{ ownerType: 'software', ownerId: row.softwareId }], title: `${row.software.title} ${row.version}`.trim() } : null
  }
  if (ownerType === 'episode') {
    const episode = await db.cinemaEpisode.findUnique({ where: { id: ownerId }, select: { access: true, number: true, season: { select: { titleId: true, number: true, title: { select: { access: true, status: true, publishedAt: true, slug: true, title: true } } } } } })
    if (!episode || episode.season.title.status !== 'PUBLISHED' || episode.season.title.publishedAt > new Date()) return null
    return { access: episode.access === 'MEMBERS' || episode.season.title.access === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC', path: `/cinema/${episode.season.title.slug}`, chain: [{ ownerType: 'title', ownerId: episode.season.titleId }], title: `${episode.season.title.title} S${String(episode.season.number).padStart(2, '0')}E${String(episode.number).padStart(2, '0')}` }
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
  // A link with its own price is checked first; otherwise the item's price or VIP rule applies.
  const access = await gate(viewer, [{ ownerType: 'link', ownerId: id }, ...owner.chain], link.access === 'MEMBERS' || owner.access === 'MEMBERS')
  if (access === 'buy') return mustBuy(request, owner.path, json)
  if (access !== 'ok') return denied(request, access, json)

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
  return fileRedirect(request, settings ? signOriginUrl(link.url, settings, request.headers) : link.url, link.kind !== 'STREAM', { title: owner.title, label: link.label, quality: link.quality })
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
  const track = await db.musicTrack.findFirst({ where: { id, status: 'PUBLISHED', publishedAt: { lte: new Date() } }, select: { id: true, slug: true, title: true, audioUrl: true, audioHqUrl: true, access: true, albumId: true, album: { select: { access: true, title: true, cover: true } }, cover: true, artist: { select: { name: true } } } }).catch(() => null)
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
  const chain: Chain = [{ ownerType: 'track', ownerId: track.id }, ...(track.albumId ? [{ ownerType: 'album' as const, ownerId: track.albumId }] : [])]
  const access = await gate(viewer, chain, needsVip)
  if (access === 'buy') return mustBuy(request, `/music/track/${track.slug}`, json)
  if (access !== 'ok') return denied(request, access, json)
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
  return fileRedirect(request, target, download, { title: `${track.artist.name} - ${track.title}`, quality: hq ? 'HQ' : '' }, { title: track.title, artist: track.artist.name, album: track.album?.title, cover: track.cover || track.album?.cover || '' })
}

// ------------------------------------------------------------------ online player

/** A subtitle the player can load: served by this site as WebVTT, under the same rules as the file it belongs to. */
export type PlayerSubtitle = { id: number; language: string; label: string; src: string }

export type WatchResult =
  | { ok: true; subtitles: PlayerSubtitle[]; id: number; src: string; playback: PlaybackKind; title: string; subtitle: string; poster: string; backPath: string; label: string; quality: string; downloadHref: string; resumeKey: string; progressEnabled: boolean; serverResume: number | null; nextEpisode: { href: string; label: string } | null }
  | { ok: false; reason: 'not-found' | 'removed' | 'login' | 'vip' | 'buy' | 'expired' | 'unplayable'; backPath: string }

async function watchOwner(ownerType: string, ownerId: number) {
  if (ownerType === 'title') {
    const row = await db.cinemaTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED' }, select: { title: true, poster: true, backdrop: true } })
    return row && { title: row.title, subtitle: '', poster: row.backdrop || row.poster }
  }
  if (ownerType === 'episode') {
    const row = await db.cinemaEpisode.findUnique({ where: { id: ownerId }, select: { number: true, title: true, season: { select: { number: true, title: { select: { title: true, poster: true, backdrop: true } } } } } })
    return row && { title: row.season.title.title, subtitle: `فصل ${row.season.number.toLocaleString('fa-IR')} · قسمت ${row.number.toLocaleString('fa-IR')}${row.title ? ` — ${row.title}` : ''}`, poster: row.season.title.backdrop || row.season.title.poster }
  }
  if (ownerType === 'game') {
    const row = await db.gameTitle.findFirst({ where: { id: ownerId, status: 'PUBLISHED' }, select: { title: true } })
    return row && { title: row.title, subtitle: '', poster: '' }
  }
  return null
}

async function nextPlayableEpisode(episodeId: number, viewer: { userId: number | null; member: boolean }) {
  const current = await db.cinemaEpisode.findUnique({ where: { id: episodeId }, select: { number: true, season: { select: { number: true, titleId: true } } } })
  if (!current) return null
  const candidate = await db.cinemaEpisode.findFirst({
    where: { season: { titleId: current.season.titleId }, OR: [
      { season: { number: current.season.number }, number: { gt: current.number } },
      { season: { number: { gt: current.season.number } } },
    ] },
    orderBy: [{ season: { number: 'asc' } }, { number: 'asc' }],
    select: { id: true, number: true, airDate: true, season: { select: { number: true } } },
  })
  if (!candidate || (candidate.airDate && candidate.airDate > new Date())) return null
  const links = await db.mediaLink.findMany({ where: { ownerType: 'episode', ownerId: candidate.id, disabled: false }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, url: true, kind: true, access: true } })
  const link = links.find((row) => playbackKind(row.url, row.kind, toEmbedUrl) !== 'none')
  if (!link) return null
  const owner = await ownerOf('episode', candidate.id)
  if (!owner || await gate(viewer, [{ ownerType: 'link', ownerId: link.id }, ...owner.chain], link.access === 'MEMBERS' || owner.access === 'MEMBERS') !== 'ok') return null
  const protectedHref = await linkHref(link.id, viewer.userId)
  const token = new URL(protectedHref, 'http://localhost').searchParams.get('t')
  return { href: `/watch/${link.id}${token ? `?t=${encodeURIComponent(token)}` : ''}`, label: `S${candidate.season.number}E${candidate.number}` }
}

/**
 * The /watch/:id player: same access rules as the download redirect (VIP,
 * signed page token, login requirement) but never counted against the daily
 * download quota. Returns the playable (optionally signed) URL.
 */
export async function watchSource(rawId: string, token: string | null, headers: Headers): Promise<WatchResult> {
  const id = Number(rawId)
  const link = Number.isSafeInteger(id) && id > 0 ? await db.mediaLink.findUnique({ where: { id } }).catch(() => null) : null
  if (!link || !['title', 'episode', 'game'].includes(link.ownerType)) return { ok: false, reason: 'not-found', backPath: '/' }
  const module = OWNER_MODULE[link.ownerType]
  const owner = module && await isModuleEnabled(module) ? await ownerOf(link.ownerType, link.ownerId).catch(() => null) : null
  if (!owner) return { ok: false, reason: 'not-found', backPath: '/' }
  if (link.disabled) return { ok: false, reason: 'removed', backPath: owner.path }
  const viewer = await getViewer()
  const access = await gate(viewer, [{ ownerType: 'link', ownerId: id }, ...owner.chain], link.access === 'MEMBERS' || owner.access === 'MEMBERS')
  if (access !== 'ok') return { ok: false, reason: access, backPath: owner.path }
  const playback = playbackKind(link.url, link.kind, toEmbedUrl)
  if (playback === 'none') return { ok: false, reason: 'unplayable', backPath: owner.path }
  const settings = await downloadGuardEnabled() ? await getDownloadSettings() : null
  if (settings?.enforceTokens && checkPageToken(token, `l${id}`, viewer.userId) !== 'ok') return { ok: false, reason: 'expired', backPath: owner.path }
  if (settings?.requireLogin && !viewer.userId) return { ok: false, reason: 'login', backPath: owner.path }
  const info = await watchOwner(link.ownerType, link.ownerId)
  const progressEnabled = !!viewer.userId && link.ownerType !== 'game' && playback !== 'embed'
  const progress = progressEnabled ? await db.cinemaWatchProgress.findUnique({ where: { userId_ownerType_ownerId: { userId: viewer.userId!, ownerType: link.ownerType, ownerId: link.ownerId } }, select: { positionSeconds: true, completedAt: true } }) : null
  const nextEpisode = link.ownerType === 'episode' && playback !== 'embed' ? await nextPlayableEpisode(link.ownerId, viewer) : null
  await db.mediaLink.update({ where: { id }, data: { clicks: { increment: 1 } } }).catch(() => undefined)
  const src = playback === 'embed' ? toEmbedUrl(link.url) : await maskedHref(settings ? signOriginUrl(link.url, settings, headers) : link.url, { download: false, context: { title: owner.title, label: link.label, quality: link.quality } })
  // The subtitle files of the same film or episode that this viewer may open and the player can show.
  const subtitles: PlayerSubtitle[] = []
  if (playback !== 'embed' && link.ownerType !== 'game') {
    const rows = await db.mediaLink.findMany({ where: { ownerType: link.ownerType, ownerId: link.ownerId, kind: 'SUBTITLE', disabled: false }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, kind: true, language: true, label: true, url: true, access: true } })
    for (const row of trackLinks(rows).subtitles) {
      if (!subtitleFormat(row.url)) continue
      if (await gate(viewer, [{ ownerType: 'link', ownerId: row.id }, ...owner.chain], row.access === 'MEMBERS' || owner.access === 'MEMBERS') !== 'ok') continue
      const pageToken = new URL(await linkHref(row.id, viewer.userId), 'http://x').searchParams.get('t')
      subtitles.push({ id: row.id, language: row.language, label: row.label || trackLanguage(row.language, true) || 'زیرنویس', src: `/api/media/subtitle/${row.id}${pageToken ? `?t=${encodeURIComponent(pageToken)}` : ''}` })
    }
  }
  return {
    ok: true, subtitles, id, src, playback, title: info?.title || '', subtitle: info?.subtitle || '', poster: info?.poster || '', backPath: owner.path,
    label: link.label, quality: link.quality,
    downloadHref: link.kind === 'DOWNLOAD' ? (settings?.enforceTokens && token ? `/api/media/link/${id}?t=${encodeURIComponent(token)}` : `/api/media/link/${id}`) : '',
    resumeKey: `watch:${link.ownerType}:${link.ownerId}`,
    progressEnabled, serverResume: progress ? (progress.completedAt ? 0 : progress.positionSeconds) : null, nextEpisode,
  }
}

/**
 * GET /api/media/subtitle/:id?t=<token> → the subtitle file as WebVTT, for the player. The same checks as the
 * link route (module, takedown, price or VIP, page token); the file is read by the server, so its address
 * never reaches the browser, and it is converted so a SubRip file plays too.
 */
export async function openSubtitle(request: Request, rawId: string) {
  const refuse = (error: string, status: number) => NextResponse.json({ error }, { status })
  const id = Number(rawId)
  const link = Number.isSafeInteger(id) && id > 0 ? await db.mediaLink.findUnique({ where: { id } }).catch(() => null) : null
  const format = link && link.kind === 'SUBTITLE' && !link.disabled ? subtitleFormat(link.url) : ''
  if (!link || !format) return refuse('NOT_FOUND', 404)
  const module = OWNER_MODULE[link.ownerType]
  const owner = module && await isModuleEnabled(module) ? await ownerOf(link.ownerType, link.ownerId).catch(() => null) : null
  if (!owner) return refuse('NOT_FOUND', 404)
  const viewer = await getViewer()
  const access = await gate(viewer, [{ ownerType: 'link', ownerId: id }, ...owner.chain], link.access === 'MEMBERS' || owner.access === 'MEMBERS')
  if (access !== 'ok') return refuse(access === 'login' ? 'LOGIN_REQUIRED' : access === 'buy' ? 'PURCHASE_REQUIRED' : 'MEMBERS_ONLY', access === 'login' ? 401 : access === 'buy' ? 402 : 403)
  const settings = await downloadGuardEnabled() ? await getDownloadSettings() : null
  if (settings?.enforceTokens && checkPageToken(new URL(request.url).searchParams.get('t'), `l${id}`, viewer.userId) !== 'ok') return refuse('EXPIRED', 403)
  if (settings?.requireLogin && !viewer.userId) return refuse('LOGIN_REQUIRED', 401)
  let vtt = ''
  try {
    const { fetchRemoteBytes } = await import('@/modules/downloads/server/files')
    vtt = toWebVtt(decodeSubtitle(await fetchRemoteBytes(settings ? signOriginUrl(link.url, settings, request.headers) : link.url, MAX_SUBTITLE_BYTES)), format)
  } catch { return refuse('UNAVAILABLE', 502) }
  if (!vtt) return refuse('UNAVAILABLE', 502)
  return new NextResponse(vtt, { headers: { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' } })
}

export async function saveCinemaWatchProgress(userId: number, linkId: number, positionSeconds: number, durationSeconds: number) {
  if (!Number.isSafeInteger(linkId) || linkId <= 0 || !Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds)
    || positionSeconds < 0 || durationSeconds <= 0 || durationSeconds > 86400 || positionSeconds > durationSeconds + 10) return null
  const link = await db.mediaLink.findUnique({ where: { id: linkId }, select: { id: true, ownerType: true, ownerId: true, disabled: true, access: true, url: true, kind: true } })
  if (!link || link.disabled || !['title', 'episode'].includes(link.ownerType) || playbackKind(link.url, link.kind, toEmbedUrl) === 'none' || !await isModuleEnabled('cinema')) return null
  const owner = await ownerOf(link.ownerType, link.ownerId)
  if (!owner) return null
  const viewer = await getViewer()
  if (viewer.userId !== userId || await gate(viewer, [{ ownerType: 'link', ownerId: linkId }, ...owner.chain], link.access === 'MEMBERS' || owner.access === 'MEMBERS') !== 'ok') return null
  const duration = Math.round(durationSeconds)
  const position = Math.min(duration, Math.round(positionSeconds))
  const completed = position >= duration * 0.95 || duration - position < 30
  const record = await db.cinemaWatchProgress.upsert({
    where: { userId_ownerType_ownerId: { userId, ownerType: link.ownerType, ownerId: link.ownerId } },
    create: { userId, ownerType: link.ownerType, ownerId: link.ownerId, positionSeconds: completed ? 0 : position, durationSeconds: duration, completedAt: completed ? new Date() : null },
    update: { positionSeconds: completed ? 0 : position, durationSeconds: duration, completedAt: completed ? new Date() : null },
    select: { positionSeconds: true, completedAt: true },
  })
  return { positionSeconds: record.positionSeconds, completed: !!record.completedAt }
}

/** Which of these links can be watched in the site player (the URLs themselves stay server-side). */
export async function playableLinks(ids: number[]): Promise<Map<number, PlaybackKind>> {
  if (!ids.length) return new Map()
  const rows = await db.mediaLink.findMany({ where: { id: { in: ids }, ownerType: { in: ['title', 'episode', 'game'] } }, select: { id: true, url: true, kind: true } }).catch(() => [])
  return new Map(rows.map((row) => [row.id, playbackKind(row.url, row.kind, toEmbedUrl)]))
}
