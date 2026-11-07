import { listThemeTemplates, type ResolvedTemplate } from './theme-templates'
import { getBuilderDoc } from './builder'
import { isModuleEnabled } from '@/extensions/server/modules'
import { pickTemplate } from '../domain/theme-templates'
import type { BuilderSurface } from '../domain/builder-surfaces'
import type { BuilderPreview } from './builder-preview'
import { getBuilderMedia, getBuilderMediaExample } from '@/modules/media/server/queries'
import { contentPath } from '@/platform/routing/aliases'

export async function resolveSurfaceTemplate(surface: BuilderSurface, entryId: number, preview?: BuilderPreview): Promise<ResolvedTemplate | null> {
  if (!await isModuleEnabled('page-builder')) return null
  const templates = (await listThemeTemplates()).filter(meta => meta.type === 'surface' && meta.surface === surface)
  const meta = preview?.template?.type === 'surface' ? templates.find(t => t.id === preview.template!.id) : pickTemplate(templates, 'surface', { route: 'surface', surface, entryId })
  if (!meta) return null
  const doc = preview?.template?.id === meta.id ? preview.template.doc : await getBuilderDoc(meta.id)
  return doc ? { meta, doc } : null
}

const SOURCE: Record<Exclude<BuilderSurface, 'dashboard' | 'account'>, string> = { movie: 'cinema-movies', series: 'cinema-series', track: 'music-new', album: 'music-albums', game: 'games-new', software: 'software-new' }
export async function surfaceExamples(surface: BuilderSurface) {
  if (surface === 'dashboard' || surface === 'account') return []
  const feed = await getBuilderMedia(SOURCE[surface], 16)
  return feed.items.map(item => ({ id: item.id, slug: item.slug, title: item.title, url: surface === 'movie' || surface === 'series' ? contentPath('title', item.slug) : surface === 'track' || surface === 'album' ? contentPath(surface, item.slug, { artist: 'artist' in item ? item.artist.slug : undefined }) : contentPath(surface, item.slug) }))
}

export async function exactSurfaceExample(surface: BuilderSurface, id: number) {
  return surface === 'dashboard' || surface === 'account' ? null : getBuilderMediaExample(SOURCE[surface], id)
}
