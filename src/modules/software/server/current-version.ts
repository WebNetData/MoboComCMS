import { db } from '@/platform/database/prisma'

/** The release table is authoritative once a title has any version history. */
export type CurrentVersion = { version: string; size: string; changelog: string; releasedAt: Date }
export type VersionProjection = Map<number, CurrentVersion | null>

/** A bounded relation read: one due release and an existence count per title. */
export async function currentSoftwareVersions(ids: number[], now = new Date()): Promise<VersionProjection> {
  const result: VersionProjection = new Map()
  const unique = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))]
  for (let offset = 0; offset < unique.length; offset += 500) {
    const rows = await db.softwareTitle.findMany({
      where: { id: { in: unique.slice(offset, offset + 500) } },
      select: {
        id: true,
        _count: { select: { releases: true } },
        releases: { where: { status: 'PUBLISHED', releasedAt: { lte: now } }, orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }], take: 1, select: { version: true, size: true, changelog: true, releasedAt: true } },
      },
    })
    for (const row of rows) if (row._count.releases) result.set(row.id, row.releases[0] || null)
  }
  return result
}

export function projectSoftwareVersion<T extends { id: number; version: string; size: string; releasedAt: Date | null; updatedAt: Date; changelog?: string }>(row: T, versions: VersionProjection): T {
  const current = versions.get(row.id)
  if (current === undefined) return row
  if (current === null) return { ...row, version: '', releasedAt: null, ...(row.changelog === undefined ? {} : { changelog: '' }) }
  return {
    ...row,
    version: current.version,
    size: current.size || row.size,
    releasedAt: current.releasedAt,
    updatedAt: current.releasedAt > row.updatedAt ? current.releasedAt : row.updatedAt,
    ...(row.changelog === undefined ? {} : { changelog: current.changelog }),
  }
}
