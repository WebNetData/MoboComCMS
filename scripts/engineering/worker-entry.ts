import { runQueue } from '../../src/modules/operations/server/queue'
import { engineeringApproval, reconcileEngineeringRuns } from '../../src/modules/ai/server/engineering'
import { db } from '../../src/platform/database/prisma'

async function main() {
  if (process.argv[2] === '--check') { await db.aiEngineeringRun.count(); process.stdout.write(JSON.stringify({ ready: true, queue: 'BackgroundJob', productionActions: false })); return }
  if (process.argv[2] === '--approval') {
    const operation = process.argv[3]
    if (!['promote', 'rollback', 'publish', 'repair'].includes(operation)) throw new Error('Unknown approval operation')
    const receipt = await engineeringApproval(process.argv[4], operation as 'promote' | 'rollback' | 'publish' | 'repair')
    process.stdout.write(JSON.stringify(receipt)); return
  }
  // Uses the existing queue and its atomic claims; no second executable queue.
  let stopped = false
  process.on('SIGTERM', () => { stopped = true }); process.on('SIGINT', () => { stopped = true })
  while (!stopped) { try { await reconcileEngineeringRuns(); await runQueue(1000, ['ai.engineering']) } catch { process.stderr.write('Engineering queue unavailable; preserved for retry\n') } if (!stopped) await new Promise(resolve => setTimeout(resolve, 5000)) }
}
main().then(() => process.exit(0)).catch(() => { process.stderr.write('Canonical engineering authority unavailable\n'); process.exit(1) })
