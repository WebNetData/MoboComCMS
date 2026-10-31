import { mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { InstallError } from '../domain/installer'
import { configDirectory } from './state'

let busy = false
export async function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (busy) throw new InstallError('عملیات دیگری در حال انجام است؛ چند لحظه صبر کنید', 409)
  busy = true
  const file = join(configDirectory(), 'install.operation.lock')
  let descriptor: number | undefined
  try {
    mkdirSync(configDirectory(), { recursive: true })
    try { descriptor = openSync(file, 'wx', 0o600) } catch { throw new InstallError('نصب دیگری در حال اجراست؛ اگر پردازش قبلی متوقف شده، قفل install.operation.lock را پس از بررسی روی سرور آزاد کنید.', 409) }
    return await work()
  } finally { if (descriptor !== undefined) { closeSync(descriptor); unlinkSync(file) }; busy = false }
}
