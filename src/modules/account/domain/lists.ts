import type { ItemType } from '@/modules/content/domain/items'

// Every list a member keeps things in, named one way. The lists stay where they are kept (favourites with
// reviews, shelves with games, playlists with music, collections with content); a key only says which one.
//
//   favorites            the member's favourites
//   games:<STATUS>       a shelf of the game library (PLAYING, PLAYED, WANT, DROPPED)
//   playlist:<id>        one of the member's playlists
//   collection:<id>      a collection the member owns or helps with

export const GAME_SHELVES = ['PLAYING', 'PLAYED', 'WANT', 'DROPPED'] as const
export type GameShelf = (typeof GAME_SHELVES)[number]

export type ListKey =
  | { kind: 'favorites' }
  | { kind: 'games'; shelf: GameShelf }
  | { kind: 'playlist'; id: number }
  | { kind: 'collection'; id: number }

export function parseListKey(value: unknown): ListKey | null {
  const text = String(value ?? '')
  if (text === 'favorites') return { kind: 'favorites' }
  const [kind, rest, extra] = text.split(':')
  if (extra !== undefined || !rest) return null
  if (kind === 'games') return (GAME_SHELVES as readonly string[]).includes(rest) ? { kind: 'games', shelf: rest as GameShelf } : null
  const id = Number(rest)
  if ((kind === 'playlist' || kind === 'collection') && /^\d+$/.test(rest) && Number.isSafeInteger(id) && id > 0) return { kind, id }
  return null
}

export const listKey = (key: ListKey): string => (key.kind === 'favorites' ? 'favorites' : key.kind === 'games' ? `games:${key.shelf}` : `${key.kind}:${key.id}`)

/** What a list of this kind can hold: a shelf holds games, a playlist songs, the other two anything. */
export const listAccepts = (key: ListKey, type: ItemType) => (key.kind === 'games' ? type === 'game' : key.kind === 'playlist' ? type === 'track' : true)

export type MemberList = { key: string; kind: ListKey['kind']; title: string; count: number; href: string; accepts: 'any' | 'game' | 'track' }
