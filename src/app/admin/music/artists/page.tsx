import ArtistManager from './ArtistManager'

export default async function MusicArtistsAdmin({searchParams}:{searchParams:Promise<{edit?:string;filter?:string}>}) {
  const params=await searchParams,id=Number(params.edit)
  return <ArtistManager initialId={Number.isSafeInteger(id)&&id>0?id:null} initialFilter={['missing-image','featured','unlinked'].includes(params.filter||'')?params.filter||'':''}/>
}
