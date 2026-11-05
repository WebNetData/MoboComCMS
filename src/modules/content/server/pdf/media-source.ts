import { db } from '@/platform/database/prisma'
import { type Viewer } from '@/modules/membership/server/membership'
import { PdfError,type PdfRef } from '@/modules/content/domain/pdf'
import { contentPath } from '@/platform/routing/aliases'
import { userOpensAudience } from '@/modules/account/server/item-audience'
import { pdfAccess,pdfContent,pdfTextHtml,dateFact,dataFacts,live,escapePdfHtml } from './source-common'

export async function mediaPdfSource(ref:PdfRef,viewer:Viewer){
  if(ref.type==='title'){
    const r=await db.cinemaTitle.findFirst({where:{id:ref.id,...live()},select:{id:true,slug:true,kind:true,title:true,titleEn:true,summary:true,poster:true,year:true,imdbRating:true,runtime:true,countries:true,languages:true,genres:true,director:true,producer:true,access:true,audienceGroups:true,updatedAt:true,seasons:{orderBy:{number:'asc'},take:151,select:{number:true,name:true,episodes:{orderBy:{number:'asc'},take:151,select:{number:true,title:true}}}}}})
    if(!r)return null;await pdfAccess(ref,viewer,r,[{ownerType:'title',ownerId:r.id}])
    if(r.seasons.length>150||r.seasons.some(s=>s.episodes.length>150))throw new PdfError('فهرست فصل‌ها یا قسمت‌ها برای یک PDF بیش از حد طولانی است',413)
    const seasons=r.kind==='SERIES'?r.seasons.map(s=>'<h2>فصل '+s.number+(s.name?' — '+escapePdfHtml(s.name):'')+'</h2><p>'+s.episodes.map(e=>'قسمت '+e.number+(e.title?' - '+escapePdfHtml(e.title):'')).join(' · ')+'</p>').join(''):''
    return pdfContent(ref,{kind:r.kind==='SERIES'?'series':'movie',title:r.title,subtitle:r.titleEn,summary:'',html:r.summary+seasons,image:r.poster,url:'/cinema/'+r.slug,updatedAt:r.updatedAt,author:'',facts:[['سال',String(r.year||'')],['امتیاز IMDb',String(r.imdbRating||'')],['مدت',r.runtime?r.runtime+' دقیقه':''],['ژانر',r.genres],['کشور',r.countries],['زبان',r.languages],['کارگردان',r.director],['تهیه‌کننده',r.producer]]})
  }
  if(ref.type==='track'){
    const r=await db.musicTrack.findFirst({where:{id:ref.id,...live()},select:{id:true,slug:true,title:true,titleEn:true,lyrics:true,cover:true,genre:true,duration:true,access:true,audienceGroups:true,updatedAt:true,artist:{select:{name:true,slug:true}},album:{select:{id:true,title:true,cover:true,access:true,audienceGroups:true}}}})
    if(!r)return null
    if(r.album&&!await userOpensAudience(r.album.audienceGroups,'album',viewer.userId))return null
    await pdfAccess(ref,viewer,r,[{ownerType:'track',ownerId:r.id},...(r.album?[{ownerType:'album' as const,ownerId:r.album.id}]:[])])
    if(r.album)await pdfAccess({type:'album',id:r.album.id},viewer,r.album,[{ownerType:'album',ownerId:r.album.id}])
    return pdfContent(ref,{kind:'track',title:r.title,subtitle:r.artist.name,summary:r.titleEn,html:r.lyrics,image:r.cover||r.album?.cover||'',url:contentPath('track',r.slug,{artist:r.artist.slug}),updatedAt:r.updatedAt,author:'',facts:[['خواننده',r.artist.name],['آلبوم',r.album?.title||'تک‌آهنگ'],['سبک',r.genre],['مدت',r.duration?Math.floor(r.duration/60)+':'+String(r.duration%60).padStart(2,'0'):'']]})
  }
  if(ref.type==='album'){
    const r=await db.musicAlbum.findFirst({where:{id:ref.id,...live()},select:{id:true,slug:true,title:true,titleEn:true,description:true,cover:true,year:true,genre:true,access:true,audienceGroups:true,updatedAt:true,artist:{select:{name:true,slug:true}},tracks:{where:{...live(),audienceGroups:''},orderBy:{trackNo:'asc'},take:201,select:{title:true,duration:true}}}})
    if(!r)return null;await pdfAccess(ref,viewer,r,[{ownerType:'album',ownerId:r.id}])
    if(r.tracks.length>200)throw new PdfError('فهرست آهنگ‌ها برای یک PDF بیش از حد طولانی است',413)
    return pdfContent(ref,{kind:'album',title:r.title,subtitle:r.artist.name,summary:r.titleEn,html:r.description+'<h2>فهرست آهنگ‌ها</h2><ol>'+r.tracks.map(t=>'<li>'+escapePdfHtml(t.title)+'</li>').join('')+'</ol>',image:r.cover,url:contentPath('album',r.slug,{artist:r.artist.slug}),updatedAt:r.updatedAt,author:'',facts:[['خواننده',r.artist.name],['سال',String(r.year||'')],['سبک',r.genre]]})
  }
  if(ref.type==='playlist'){
    const r=await db.musicPlaylist.findFirst({where:{id:ref.id,status:'PUBLISHED'},select:{id:true,slug:true,title:true,titleEn:true,description:true,cover:true,access:true,updatedAt:true,trackIds:true}})
    if(!r)return null;await pdfAccess(ref,viewer,r)
    let ids:number[]=[];try{const parsed:unknown=JSON.parse(r.trackIds);if(Array.isArray(parsed))ids=parsed.filter((id):id is number=>Number.isSafeInteger(id)&&Number(id)>0)}catch{/* malformed legacy list has no playable tracks */}
    if(ids.length>200)throw new PdfError('فهرست آهنگ‌ها برای یک PDF بیش از حد طولانی است',413)
    const rows=await db.musicTrack.findMany({where:{id:{in:ids},...live()},select:{id:true,title:true,audienceGroups:true,artist:{select:{name:true}},album:{select:{audienceGroups:true}}}})
    const tracks=[];for(const id of ids){const row=rows.find(t=>t.id===id);if(row&&await userOpensAudience(row.audienceGroups,'track',viewer.userId)&&(!row.album||await userOpensAudience(row.album.audienceGroups,'album',viewer.userId)))tracks.push(row)}
    return pdfContent(ref,{kind:'playlist',title:r.title,subtitle:r.titleEn,summary:'',html:r.description+'<h2>فهرست آهنگ‌ها</h2><ol>'+tracks.map(t=>'<li>'+escapePdfHtml(t.title+' — '+t.artist.name)+'</li>').join('')+'</ol>',image:r.cover,url:'/music/playlist/'+r.slug,updatedAt:r.updatedAt,author:'',facts:[['آهنگ‌ها',String(tracks.length)]]})
  }
  if(ref.type==='game'){
    const r=await db.gameTitle.findFirst({where:{id:ref.id,...live()},select:{id:true,slug:true,title:true,titleEn:true,summary:true,content:true,cover:true,platforms:true,genres:true,developer:true,publisher:true,score:true,requirements:true,access:true,audienceGroups:true,updatedAt:true,releaseDate:true}})
    if(!r)return null;await pdfAccess(ref,viewer,r,[{ownerType:'game',ownerId:r.id}])
    return pdfContent(ref,{kind:'game',title:r.title,subtitle:r.titleEn,summary:r.summary,html:r.content,image:r.cover,url:'/games/'+r.slug,updatedAt:r.updatedAt,author:'',facts:[['پلتفرم',r.platforms],['سبک',r.genres],['سازنده',r.developer],['ناشر',r.publisher],['امتیاز',String(r.score||'')],['انتشار',dateFact(r.releaseDate)],...dataFacts(r.requirements)]})
  }
  if(ref.type==='software'){
    const r=await db.softwareTitle.findFirst({where:{id:ref.id,...live()},select:{id:true,slug:true,title:true,titleEn:true,summary:true,content:true,cover:true,icon:true,version:true,developer:true,platforms:true,license:true,size:true,requirements:true,installGuide:true,access:true,audienceGroups:true,updatedAt:true}})
    if(!r)return null;await pdfAccess(ref,viewer,r,[{ownerType:'software',ownerId:r.id}])
    return pdfContent(ref,{kind:'software',title:r.title,subtitle:r.titleEn,summary:r.summary,html:r.content+(r.installGuide?'<h2>راهنمای نصب</h2>'+r.installGuide:'')+(r.requirements?'<h2>پیش‌نیازها</h2>'+pdfTextHtml(r.requirements):''),image:r.cover||r.icon,url:'/software/'+r.slug,updatedAt:r.updatedAt,author:'',facts:[['نسخه',r.version],['توسعه‌دهنده',r.developer],['سیستم‌عامل',r.platforms],['مجوز',r.license],['حجم',r.size]]})
  }
  return null
}
