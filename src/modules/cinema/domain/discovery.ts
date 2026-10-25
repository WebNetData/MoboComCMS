export type CinemaSearch = { format?:string; kind?:string; genre?:string; year?:string; country?:string; dubbed?:string; sort?:string; q?:string; page?:string; actor?:string; director?:string; producer?:string }
const KEYS:(keyof CinemaSearch)[]=['q','format','kind','genre','year','country','actor','director','producer','dubbed','sort','page']

/** Missing means no filter; malformed IDs deliberately match no public credit. */
export function cinemaPersonId(value:unknown):number|null {
  if(value===undefined||value===null||value==='')return null
  if(typeof value!=='string'&&typeof value!=='number')return -1
  const id=Number(value)
  return Number.isSafeInteger(id)&&id>0&&id<=2147483647?id:-1
}
export function cinemaBrowsePage(value:unknown) {
  const page=Number(value)
  return Number.isFinite(page)?Math.max(1,Math.min(500,Math.trunc(page)||1)):1
}
/** Changes reset the page; explicit pagination retains all supported filters. */
export function cinemaBrowseHref(input:CinemaSearch,patch:Partial<CinemaSearch>={}) {
  const next={...input,page:undefined,...patch},query=new URLSearchParams()
  for(const key of KEYS)if(typeof next[key]==='string'&&next[key])query.set(key,next[key]!)
  return '/cinema/browse'+(query.size?'?'+query.toString():'')
}
