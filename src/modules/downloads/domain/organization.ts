export type AssetOrganization = { section: string; title?: string; titleEn?: string; artistEn?: string; artistId?: number; quality?: string; category?: string; artist?: string; album?: string; season?: number; artistImage?: boolean; video?: boolean; personRole?: 'actor'|'director'; enabled?: boolean; slug?: string; categorySlug?: string }
/** One safe, portable directory name. Display titles and public content URLs are never changed. */
export function organizationSegment(raw: unknown, fallback='') {
  const value=String(raw ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*%]/g,' ').replace(/\s+/g,' ').trim().replace(/^[. ]+|[. ]+$/g,'').slice(0,100).trim()
  return !value || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(value) ? fallback : value
}
export function organizationPath(context: AssetOrganization | undefined, kind: 'image'|'file'): string {
  if (!context || context.enabled===false) return ''
  const title=organizationSegment(context.title),category=organizationSegment(context.category,'Uncategorized')
  if(context.section==='music') {
    const artist=organizationSegment(context.artist);if(!artist)return ''
    const base=`download/music/${artist}`,album=organizationSegment(context.album)
    return context.artistImage ? `${base}/image` : `${base}${album?'/'+album:''}${kind==='image'?'/image':''}`
  }
  // Store, journal and page pictures follow the item's public address: shop/product/<category>/<slug>, blog/<category>/<slug>, pages/<slug>.
  if(['shop','blog','pages'].includes(context.section)) {
    if(kind!=='image')return ''
    const item=organizationSegment(context.slug)||title;if(!item)return ''
    const group=organizationSegment(context.categorySlug)||organizationSegment(context.category,'Uncategorized')
    return context.section==='shop'?`shop/product/${group}/${item}`:context.section==='blog'?`blog/${group}/${item}`:`pages/${item}`
  }
  if(!title)return ''
  if(context.section==='film')return `download/movie/${title}${kind==='image'?'/images':''}`
  if(context.section==='cinema-person' && kind==='image' && ['actor','director'].includes(context.personRole || ''))return `download/cinema/images/${context.personRole==='director'?'director':'actors'}/${title}`
  if(context.section==='series')return `download/series/${title}/${kind==='image'?'images':Number.isSafeInteger(context.season)&&Number(context.season)>=0&&Number(context.season)<=999?'Season'+context.season:'video'}`
  if(context.section==='software')return `download/Sofware/${category}/${title}${kind==='image'?'/images':''}`
  if(context.section==='games')return `download/Game/${category}/${title}${kind==='image'?'/images':context.video?'/videos':''}`
  if(context.section==='products')return `download/Products/${category}/${title}/${kind==='image'?'images':'videos'}`
  return ''
}
export function validOrganizationPath(raw: unknown): raw is string {
  if(typeof raw!=='string' || raw.length>600)return false
  const p=raw.split('/');if(p.some(s=>!s||organizationSegment(s)!==s))return false
  if(p[0]==='shop')return p.length===4 && p[1]==='product'
  if(p[0]==='blog')return p.length===3
  if(p[0]==='pages')return p.length===2
  if(p[0]!=='download')return false
  if(p[1]==='film')return p.length===4 && ['images','video'].includes(p[3])
  if(p[1]==='movie')return p.length===3 || p.length===4 && p[3]==='images'
  if(p[1]==='cinema')return p.length===5 && p[2]==='images' && ['actors','director'].includes(p[3])
  if(p[1]==='series')return p.length===4 && /^(images|video|Season(?:0|[1-9]\d{0,2}))$/.test(p[3])
  if(p[1]==='music')return p.length>=3 && p.length<=5 && (p.length!==5||p[4]==='image')
  if(['Sofware','Game'].includes(p[1]))return p.length===4||p.length===5&&['images',...(p[1]==='Game'?['videos']:[])].includes(p[4])
  return p[1]==='Products' && p.length===5 && ['images','videos'].includes(p[4])
}

/** Readable picture names inside an organized folder: cover.webp, gallery-1.webp, poster.webp … */
export const IMAGE_ROLES = ['cover', 'image', 'gallery', 'poster', 'backdrop', 'logo', 'avatar', 'screenshot', 'content'] as const
export type ImageRole = (typeof IMAGE_ROLES)[number]
export const imageRole = (raw: unknown): ImageRole => (IMAGE_ROLES as readonly string[]).includes(String(raw)) ? raw as ImageRole : 'image'
/** The n-th candidate name for a role (n from 1); numbered roles always carry their number, the rest only on a clash. */
export function organizedImageName(role: ImageRole, n: number, extension = 'webp') {
  const numbered = role === 'gallery' || role === 'screenshot' || role === 'content'
  return `${role}${numbered || n > 1 ? '-' + n : ''}.${extension}`
}
/** A client-sent organization context, reduced to known short text fields (the path is always computed here). */
export function parseOrganization(raw: unknown): AssetOrganization | undefined {
  let value: unknown = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return undefined } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const v = value as Record<string, unknown>, text = (key: string) => typeof v[key] === 'string' ? (v[key] as string).slice(0, 200) : undefined
  if (!text('section')) return undefined
  return { section: text('section')!, title: text('title'), titleEn: text('titleEn'), slug: text('slug'), category: text('category'), categorySlug: text('categorySlug'), artist: text('artist'), album: text('album'), quality: text('quality'), season: Number.isSafeInteger(v.season) ? v.season as number : undefined, artistImage: v.artistImage === true, video: v.video === true, personRole: v.personRole === 'actor' || v.personRole === 'director' ? v.personRole : undefined, enabled: v.enabled === false ? false : undefined }
}
