import { db } from '@/platform/database/prisma'
import { profileMergeRoutes } from '@/modules/content/server/http/profile-merge'
import { cinemaMergePreview, mergeCinemaPeople } from '@/modules/cinema/server/person-merge'
export const { GET, POST } = profileMergeRoutes({ module: 'cinema', permission: 'cinema.manage', preview: cinemaMergePreview, merge: mergeCinemaPeople, search: (q, sourceId) => q.length < 2 ? Promise.resolve([]) : db.cinemaPerson.findMany({ where: { mergedIntoId: null, id: { not: sourceId }, name: { contains: q, mode: 'insensitive' } }, take: 12, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true } }) })
