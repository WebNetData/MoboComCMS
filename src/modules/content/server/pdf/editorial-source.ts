import { db } from '@/platform/database/prisma'
import { publicBlocksHtml } from '@/modules/editor/server/documents'
import { getPageLayout } from '@/modules/site/server/page-layout'
import { readShowcase } from '@/modules/prompts/domain/prompts'
import { type Viewer } from '@/modules/membership/server/membership'
import { pdfAccess,pdfContent,pdfTextHtml,dateFact,live } from './source-common'
import { type PdfRef } from '@/modules/content/domain/pdf'

export async function editorialPdfSource(ref:PdfRef,viewer:Viewer){
  if(ref.type==='post'){
    const r=await db.post.findFirst({where:{id:ref.id,...live()},select:{id:true,slug:true,title:true,excerpt:true,content:true,editorFormat:true,contentDocument:true,access:true,audienceGroups:true,cover:true,updatedAt:true,publishedAt:true,author:{select:{name:true}},category:{select:{name:true}}}})
    if(!r)return null
    await pdfAccess(ref,viewer,r,[{ownerType:'post',ownerId:r.id}])
    return pdfContent(ref,{kind:'post',title:r.title,subtitle:r.category?.name||'مجلهٔ موبوکام',summary:r.excerpt,html:await publicBlocksHtml(r)??r.content,image:r.cover,url:'/blog/'+r.slug,updatedAt:r.updatedAt,author:r.author?.name||'',facts:[['انتشار',dateFact(r.publishedAt)]]})
  }
  if(ref.type==='page'){
    const r=await db.page.findFirst({where:{id:ref.id,status:'PUBLISHED'},select:{id:true,slug:true,title:true,content:true,editorFormat:true,contentDocument:true,updatedAt:true}})
    if(!r)return null
    const layout=await getPageLayout(r.id)
    return pdfContent(ref,{kind:'page',title:r.title,subtitle:'اسناد و صفحات موبوکام',summary:'',html:await publicBlocksHtml(r)??r.content,image:layout.cover||'',url:'/p/'+r.slug,updatedAt:r.updatedAt,author:'',facts:[]})
  }
  if(ref.type==='prompt'){
    const r=await db.promptTemplate.findFirst({where:{id:ref.id,...live()},select:{id:true,slug:true,title:true,summary:true,content:true,example:true,kind:true,category:true,showcase:true,audienceGroups:true,updatedAt:true}})
    if(!r)return null
    await pdfAccess(ref,viewer,r,[{ownerType:'prompt',ownerId:r.id}])
    return pdfContent(ref,{kind:'prompt',title:r.title,subtitle:r.category,summary:r.summary,html:pdfTextHtml(r.content)+(r.example?'<h2>نمونهٔ کاربرد</h2>'+pdfTextHtml(r.example):''),image:readShowcase(r.showcase).cover,url:'/prompts/templates/'+r.slug,updatedAt:r.updatedAt,author:'',facts:[['نوع',r.kind],['دسته‌بندی',r.category]]})
  }
  return null
}
