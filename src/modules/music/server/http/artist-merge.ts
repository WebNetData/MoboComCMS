import { db } from '@/platform/database/prisma'
import { profileMergeRoutes } from '@/modules/content/server/http/profile-merge'
import { artistMergePreview, mergeMusicArtists } from '@/modules/music/server/artist-merge'
export const { GET, POST } = profileMergeRoutes({ module: 'music', permission: 'music.manage', preview: artistMergePreview, merge: mergeMusicArtists, search: (q, sourceId) => q.length < 2 ? Promise.resolve([]) : db.musicArtist.findMany({ where: { mergedIntoId: null, id: { not: sourceId }, OR: [{ name: { contains: q, mode: 'insensitive' } }, { nameEn: { contains: q, mode: 'insensitive' } }] }, take: 12, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true } }) })
