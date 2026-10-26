import type { Prisma } from '@prisma/client'
import { codesOf } from '@/modules/games/domain/games'

type Game = { platforms: string; modes: string; localization: string; storeLinks: string; releases: string; genres: string; engine: string }
const readList = (raw: string): Record<string, unknown>[] => { try { const value = JSON.parse(raw || '[]'); return Array.isArray(value) ? value : [] } catch { return [] } }

/** Whether a game uses an entry of a games list: platforms (also per-platform dates), store links, modes, localisation. */
export function gameUses(game: Game, list: string, code: string) {
  if (list === 'PLATFORM') return codesOf(game.platforms).includes(code) || readList(game.releases).some((row) => row.platform === code)
  if (list === 'STORE') return readList(game.storeLinks).some((row) => row.store === code)
  if (list === 'MODE') return codesOf(game.modes).includes(code)
  if (list === 'LOCALIZATION') return codesOf(game.localization).includes(code)
  if (list === 'GENRE') return codesOf(game.genres.replace(/،/g, ',')).includes(code)
  if (list === 'ENGINE') return game.engine === code
  return false
}

/** Counts how many games use each entry: read once, then asked per entry. */
export async function gameUsage(client: Pick<Prisma.TransactionClient, 'gameTitle'>) {
  const games = await client.gameTitle.findMany({ select: { platforms: true, modes: true, localization: true, storeLinks: true, releases: true, genres: true, engine: true } })
  return (list: string, code: string) => games.filter((game) => gameUses(game, list, code)).length
}
