import { cache } from 'react'
import { createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server'
import { normalizePdfSettings, type PdfSettings } from '@/modules/content/domain/pdf'
import { RevisionError } from '@/modules/content/server/revisions'

const history=()=>createSectionSettingsHistory('content.pdf.v1','settings-content-pdf',normalizePdfSettings,s=>({enabled:s.enabled,watermark:s.watermarkEnabled}))
export const pdfSettingsState=()=>history().current()
export const restorePdfSettings=(...args:Parameters<ReturnType<typeof history>['restore']>)=>history().restore(...args)
export const getPdfSettings=cache(()=>history().read())
export async function savePdfSettings(input: unknown, context?: SectionSettingsContext) {
  const patch=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{}
  return history().save((current:PdfSettings)=>{
    const assignments={...current.assignments}
    if(patch.assignments&&typeof patch.assignments==='object'&&!Array.isArray(patch.assignments))for(const [key,value]of Object.entries(patch.assignments))if(Object.hasOwn(assignments,key)&&value&&typeof value==='object'&&!Array.isArray(value))assignments[key as keyof typeof assignments]={...assignments[key as keyof typeof assignments],...value}
    const next={...current,...patch,assignments},checked=normalizePdfSettings(next)
    if(checked.watermarkEnabled&&checked.watermarkKind==='image'&&!checked.watermarkImage)throw new RevisionError('برای واترمارک تصویری یک تصویر عمومی از کتابخانه انتخاب کنید',422)
    return next
  },context)
}
