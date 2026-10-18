import { redirect } from 'next/navigation'
import LibraryManager from './LibraryManager'

export default async function MusicLibrary({searchParams}:{searchParams:Promise<{tab?:string;edit?:string}>}) {
  const params=await searchParams
  if(params.tab==='artists') {
    const id=Number(params.edit)
    redirect('/admin/music/artists'+(Number.isSafeInteger(id)&&id>0?'?edit='+id:''))
  }
  return <LibraryManager key={(params.tab||'tracks')+':'+(params.edit||'')} initialTab={params.tab==='albums'||params.tab==='playlists'?params.tab:'tracks'}/>
}
