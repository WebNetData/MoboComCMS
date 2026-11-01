import { env } from '@/platform/config/env'
import { command } from '@/modules/server-panel/server/system'

export const helperPath = () => env('SERVER_PANEL_WEBCTL') || '/usr/local/sbin/mobocom-webctl'

export async function helper(args: string[], timeout = 30_000, input?: string) {
  const direct = env('SERVER_PANEL_WEBCTL_SUDO') === '0'
  const result = direct ? await command(helperPath(), args, timeout, undefined, input) : await command('sudo', ['-n', helperPath(), ...args], timeout, undefined, input)
  if (!result.ok && /password is required|a terminal is required|not allowed|no such file|ENOENT|sudoers/i.test(result.out)) {
    return { ok: false, out: 'ابزار مدیریت وب روی سرور نصب نیست؛ نصب اولیهٔ سرور را کامل کنید.' }
  }
  return { ok: result.ok, out: result.out.replace(/\u001b\[[0-9;]*m/g, '').slice(0, 8000) }
}
