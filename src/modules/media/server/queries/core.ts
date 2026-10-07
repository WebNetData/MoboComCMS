/**
 * Public read models for music, film & series and games. Raw media URLs never
 * leave the server: players and download buttons go through /api/media/*.
 */

export const PAGE_SIZE = 24

export const published = { status: 'PUBLISHED', publishedAt: { lte: new Date() } }

export const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })
