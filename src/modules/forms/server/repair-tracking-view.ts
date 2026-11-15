import { parseForm, workSteps } from '../domain/forms'
import { customerRepairWork, type RepairWorkView } from '../domain/repair-work'
import { publicRepairText, type RepairRow } from './repair-access'

export function trackingProjection(row: RepairRow, repair: RepairWorkView) {
  const steps = workSteps(parseForm(row.form).settings), current = steps.find(step => step.key === row.stage)
  return { number: row.id, title: publicRepairText(row, row.form.title, 120), stage: current?.key || '', stageLabel: current ? publicRepairText(row, current.label, 80) : 'در حال بررسی', createdAt: row.createdAt.toISOString(), receivedAt: row.receivedAt?.toISOString() || null, reply: publicRepairText(row, row.reply, 1000), repair: customerRepairWork(repair),
    steps: steps.map(step => ({ key: step.key, label: publicRepairText(row, step.label, 80), current: step.key === current?.key })) }
}
