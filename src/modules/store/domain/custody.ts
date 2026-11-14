import { StoreError } from './store'

export type ReturnCustodyAction = 'REPAIR' | 'SUPPLIER_RETURN' | 'SCRAP' | 'RESTOCK'

const text = (value: unknown, max: number) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, max)

export function parseCustodyAction(raw: unknown) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const segmentIndex = Number(value.segmentIndex), action = String(value.action || '').toUpperCase() as ReturnCustodyAction
  const expectedUpdatedAt = new Date(String(value.expectedUpdatedAt ?? ''))
  const note = text(value.note, 300)
  if (!Number.isSafeInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 299 || !Number.isFinite(expectedUpdatedAt.getTime())) throw new StoreError('نسخه یا بخش کالای قرنطینه معتبر نیست')
  if (!['REPAIR', 'SUPPLIER_RETURN', 'SCRAP', 'RESTOCK'].includes(action)) throw new StoreError('تصمیم خروج کالا معتبر نیست')
  if (action === 'REPAIR') {
    const formSubmissionId = Number(value.formSubmissionId)
    if (!Number.isSafeInteger(formSubmissionId) || formSubmissionId <= 0 || value.identityConfirmed !== true) throw new StoreError('درخواست تعمیر و تطبیق حضوری شناسهٔ دستگاه را تأیید کنید')
    return { segmentIndex, action, expectedUpdatedAt, formSubmissionId, identityConfirmed: true, note }
  }
  if (action === 'RESTOCK') {
    const destinationLocationId = Number(value.destinationLocationId)
    if (!Number.isSafeInteger(destinationLocationId) || destinationLocationId <= 0 || value.healthConfirmed !== true) throw new StoreError('انبار مقصد و تأیید سلامت پس از تعمیر را ثبت کنید')
    return { segmentIndex, action, expectedUpdatedAt, destinationLocationId, healthConfirmed: true, note }
  }
  if (value.physicalReleaseConfirmed !== true) throw new StoreError('تأیید خروج فیزیکی کالا را ثبت کنید')
  return { segmentIndex, action, expectedUpdatedAt, physicalReleaseConfirmed: true, note }
}
