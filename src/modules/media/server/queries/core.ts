/**
 * Public read models for music, film & series and games. Raw media URLs never
 * leave the server: players and download buttons go through /api/media/*.
 */

export const PAGE_SIZE = 24

export const published = { status: 'PUBLISHED', publishedAt: { lte: new Date() } }

/** Published, whoever may see it: only for a page that then asks `opensAudience` or `audienceClause`. */
export const publishedNow = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })

export const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '' })
/** An unrestricted track must also have no group-limited parent album. */
export const liveTrack = () => ({ ...live(), album: { isNot: { audienceGroups: { not: '' } } } })
