export type AssetOrganization = { section: string; title?: string; category?: string; artist?: string; album?: string; season?: number; artistImage?: boolean; video?: boolean; personRole?: 'actor'|'director'; enabled?: boolean }
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
  if(p[0]!=='download')return false
  if(p[1]==='film')return p.length===4 && ['images','video'].includes(p[3])
  if(p[1]==='movie')return p.length===3 || p.length===4 && p[3]==='images'
  if(p[1]==='cinema')return p.length===5 && p[2]==='images' && ['actors','director'].includes(p[3])
  if(p[1]==='series')return p.length===4 && /^(images|video|Season(?:0|[1-9]\d{0,2}))$/.test(p[3])
  if(p[1]==='music')return p.length>=3 && p.length<=5 && (p.length!==5||p[4]==='image')
  if(['Sofware','Game'].includes(p[1]))return p.length===4||p.length===5&&['images',...(p[1]==='Game'?['videos']:[])].includes(p[4])
  return p[1]==='Products' && p.length===5 && ['images','videos'].includes(p[4])
}
