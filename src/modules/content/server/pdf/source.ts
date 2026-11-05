import { PdfError,type PdfContent,type PdfRef } from '@/modules/content/domain/pdf'
import { pdfSection,pdfViewer } from './source-common'
import { editorialPdfSource } from './editorial-source'
import { mediaPdfSource } from './media-source'
import { cataloguePdfSource } from './catalogue-source'
import { communityPdfSource } from './community-source'

export async function contentPdfSource(ref:PdfRef):Promise<PdfContent>{
  const viewer=await pdfViewer()
  await pdfSection(ref,viewer)
  const source=await editorialPdfSource(ref,viewer)??await mediaPdfSource(ref,viewer)??await cataloguePdfSource(ref,viewer)??await communityPdfSource(ref)
  if(!source)throw new PdfError('محتوای منتشرشده‌ای برای این نشانی پیدا نشد',404)
  return source
}
