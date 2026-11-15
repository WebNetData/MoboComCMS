import type { RepairClient, RepairRow } from '../repair-access'
import { publicRepairText } from '../repair-access'

export async function repairEvent(tx: RepairClient, row: Pick<RepairRow, 'id' | 'pickupCode' | 'receiptToken'>, kind: 'STAGE' | 'REPLY' | 'DUE' | 'ESTIMATE' | 'APPROVED' | 'REJECTED' | 'CONTACT', label: string, detail: string) {
  return tx.repairEvent.create({ data: { submissionId: row.id, kind, label: publicRepairText(row, label, 120), detail: publicRepairText(row, detail, 2000) } })
}
