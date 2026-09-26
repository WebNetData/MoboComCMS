/** Serializable track shape shared by server pages and the client music player. */
export type PlayerTrack = {
  id: number
  slug: string
  title: string
  artist: string
  artistSlug: string
  cover: string
  access: string
  hasHq: boolean
  duration: number
}

type TrackLike = {
  id: number; slug: string; title: string; titleEn: string; cover: string; access: string; hasHq: boolean; duration: number
  artist: { slug: string; name: string; nameEn: string }
}

export function toPlayerTracks(tracks: TrackLike[], fa: boolean): PlayerTrack[] {
  return tracks.map((track) => ({
    id: track.id,
    slug: track.slug,
    title: (fa ? track.title : track.titleEn || track.title) || track.title,
    artist: (fa ? track.artist.name : track.artist.nameEn || track.artist.name) || track.artist.name,
    artistSlug: track.artist.slug,
    cover: track.cover,
    access: track.access,
    hasHq: track.hasHq,
    duration: track.duration,
  }))
}
