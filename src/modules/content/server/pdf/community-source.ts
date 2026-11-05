import { db } from '@/platform/database/prisma'
import { itemCard } from '@/modules/content/server/registry'
import { type ItemType } from '@/modules/content/domain/items'
import { type PdfRef } from '@/modules/content/domain/pdf'
import { pdfContent,pdfTextHtml } from './source-common'
import { getForumViewer,getTopic } from '@/modules/forum/server/forum'

export async function communityPdfSource(ref:PdfRef){
  if(ref.type==='thread'||ref.type==='forum-post'){
    const row=ref.type==='forum-post'?await db.forumPost.findFirst({where:{id:ref.id,status:'VISIBLE'},select:{threadId:true,postNumber:true}}):null
    if(ref.type==='forum-post'&&!row)return null
    const topic=await getTopic(row?.threadId||ref.id,await getForumViewer(),{post:row?.postNumber||1,trackRead:false})
    const post=topic?.posts.find(p=>row?p.id===ref.id:p.number===1)
    if(!topic||topic.thread.status!=='VISIBLE'||!post||post.status!=='VISIBLE')return null
    return pdfContent(ref,{kind:'thread',title:topic.thread.title,subtitle:topic.category.title,summary:post.number===1?'پست آغازین گفتگو':'پست شمارهٔ '+post.number,html:post.html,image:'',url:'/forum/t/'+topic.thread.id+'?post='+post.number,updatedAt:post.editedAt||post.createdAt,author:post.author.name,facts:[['شمارهٔ پست',String(post.number)],['انجمن',topic.category.title]]})
  }
  if(!['artist','person','studio','business'].includes(ref.type))return null
  const r=await itemCard({type:ref.type as ItemType,id:ref.id})
  if(!r)return null
  const body=ref.type==='artist'?(await db.musicArtist.findUnique({where:{id:r.id},select:{bio:true}}))?.bio:ref.type==='person'?(await db.cinemaPerson.findUnique({where:{id:r.id},select:{bio:true}}))?.bio:ref.type==='studio'?(await db.studio.findUnique({where:{id:r.id},select:{summary:true}}))?.summary:(await db.businessProfile.findUnique({where:{id:r.id},select:{description:true}}))?.description
  // These are public profile cards, never private representative/account fields or member generations.
  return pdfContent(ref,{kind:ref.type==='business'?'business':'profile',title:r.title,subtitle:r.subtitle,summary:'',html:body?(ref.type==='business'?pdfTextHtml(body):body):pdfTextHtml(r.summary),image:r.image,url:r.url,updatedAt:r.updatedAt,author:'',facts:[]})
}
