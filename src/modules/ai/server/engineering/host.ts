import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { EngineeringError, ENGINEERING_PROTOCOL } from '../../domain/engineering'

export type HostAction = 'status' | 'prepare' | 'read' | 'apply' | 'validate' | 'poll' | 'publish' | 'promote' | 'rollback' | 'cancel' | 'diagnose' | 'repair' | 'reopen'
export type HostReceipt = { ok: boolean; ready?: boolean; phase?: string; baseSha?: string; headSha?: string; artifact?: string; prUrl?: string; files?: { path: string; sha256: string; content: string }[]; manifest?: string[]; checks?: { name: string; passed: boolean }[]; changed?: string[]; diffSummary?: string; diagnostics?: string; previous?: string; error?: string; supported?: boolean; allowedRepairs?: string[]; diagnosticHash?: string; runtimeId?: string; repairId?: string }
/** No model command, executable path, environment or remote URL enters this boundary. */
export async function engineeringHost(action: HostAction, input: Record<string, unknown> = {}): Promise<HostReceipt> {
  if (existsSync('/run/mobocom-engineering/broker.sock')) return new Promise((resolve, reject) => {
    const socket = createConnection('/run/mobocom-engineering/broker.sock'); let raw = '', settled = false
    const fail = () => { if (!settled) { settled = true; reject(new EngineeringError('ارتباط با ابزار مستقل میزبان برقرار نشد؛ نتیجهٔ ذخیره‌شده را تازه کنید', 503)) } socket.destroy() }
    socket.setTimeout(27000, fail); socket.once('error', fail)
    socket.once('connect', () => socket.write(JSON.stringify({ protocol: ENGINEERING_PROTOCOL, action, ...input }) + '\n'))
    socket.on('data', chunk => { raw += chunk; if (Buffer.byteLength(raw) > 512 * 1024) return fail(); if (!raw.includes('\n')) return; try { const value = JSON.parse(raw); if (value.protocol !== ENGINEERING_PROTOCOL || !value.ok) throw new EngineeringError(String(value.error || 'پاسخ میزبان معتبر نیست').slice(0, 800), 409); settled = true; resolve(value); socket.end() } catch (e) { settled = true; reject(e instanceof EngineeringError ? e : new EngineeringError('پاسخ میزبان معتبر نیست', 503)); socket.destroy() } })
    socket.once('end', () => { if (!settled) fail() })
  })
  return new Promise((resolve, reject) => {
    const child = execFile('sudo', ['-n', '/usr/local/sbin/mobocom-engineering', action], { timeout: 25000, maxBuffer: 512 * 1024, env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', NODE_ENV: process.env.NODE_ENV } }, (error, stdout) => {
      if (error) {
        if (action === 'status') return resolve({ ok: true, supported: false, ready: false, diagnostics: 'ابزار میزبان نصب یا مجاز نشده است؛ راهنمای AI-ENGINEERING-FA را دنبال کنید.' })
        return reject(new EngineeringError('ابزار میزبان پاسخ نداد؛ نتیجهٔ ثبت‌شده را تازه کنید. هیچ فرمان جایگزینی اجرا نشد.', 503))
      }
      try {
        const receipt = JSON.parse(stdout)
        if (!receipt || receipt.protocol !== ENGINEERING_PROTOCOL || typeof receipt.ok !== 'boolean') throw new Error('protocol')
        if (!receipt.ok) return reject(new EngineeringError(String(receipt.error || 'مرحلهٔ میزبان انجام نشد').slice(0, 800), 409))
        resolve(receipt)
      } catch (e) { reject(e instanceof EngineeringError ? e : new EngineeringError('پاسخ ابزار میزبان معتبر نیست', 503)) }
    })
    child.stdin?.end(JSON.stringify({ protocol: ENGINEERING_PROTOCOL, ...input }))
  })
}
