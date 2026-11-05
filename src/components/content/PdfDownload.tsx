import { contentPdfAvailable } from '@/modules/content/server/pdf'
import PdfDownloadButton from './PdfDownloadButton'

export default async function PdfDownload({item}:{item:string}){
  return await contentPdfAvailable(item)?<PdfDownloadButton item={item}/>:null
}
