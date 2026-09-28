import os from 'node:os'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// Server status for the panel dashboard: host, CPU, memory, disks, services
// and top processes. Commands run with fixed argument lists (no shell).

const run = promisify(execFile)

export async function command(file: string, args: string[], timeout = 4000): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout } = await run(file, args, { timeout, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } })
    return { ok: true, out: stdout }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, out: [failure.stdout, failure.stderr].filter(Boolean).join('\n') || String(failure.message || '') }
  }
}

/** Services the panel shows and may restart (through the sudoers rule the installer adds). */
export const SERVICES = [
  { id: 'mobocom', label: 'سایت (MoboComCMS)' },
  { id: 'nginx', label: 'وب‌سرور Nginx' },
  { id: 'postgresql', label: 'پایگاه داده PostgreSQL' },
  { id: 'postfix', label: 'ارسال/دریافت ایمیل Postfix' },
  { id: 'dovecot', label: 'صندوق ایمیل Dovecot (IMAP)' },
  { id: 'ssh', label: 'SSH' },
  { id: 'fail2ban', label: 'Fail2ban' },
  { id: 'cron', label: 'زمان‌بند Cron' },
  { id: 'mobocom-backup.timer', label: 'بکاپ خودکار' },
] as const

export type ServiceAction = 'restart' | 'reload' | 'start' | 'stop'

async function cpuPercent(): Promise<number> {
  const snap = () => os.cpus().reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0)
    return { idle: acc.idle + cpu.times.idle, total: acc.total + total }
  }, { idle: 0, total: 0 })
  const a = snap()
  await new Promise((resolve) => setTimeout(resolve, 250))
  const b = snap()
  const total = b.total - a.total
  return total > 0 ? Math.max(0, Math.min(100, Math.round((1 - (b.idle - a.idle) / total) * 1000) / 10)) : 0
}

async function memory() {
  const total = os.totalmem()
  try {
    const info = await fs.readFile('/proc/meminfo', 'utf8')
    const kb = (key: string) => Number(info.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] || 0) * 1024
    const available = kb('MemAvailable') || os.freemem()
    return { total, used: total - available, swapTotal: kb('SwapTotal'), swapUsed: kb('SwapTotal') - kb('SwapFree') }
  } catch {
    return { total, used: total - os.freemem(), swapTotal: 0, swapUsed: 0 }
  }
}

async function disks() {
  const result = await command('df', ['-P', '-B1', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'squashfs', '-x', 'overlay'])
  const rows = result.ok ? result.out.trim().split('\n').slice(1).map((line) => {
    const parts = line.trim().split(/\s+/)
    return { mount: parts.slice(5).join(' '), fs: parts[0], total: Number(parts[1]), used: Number(parts[2]), free: Number(parts[3]) }
  }).filter((row) => row.total > 0 && row.mount) : []
  if (rows.length) return rows.slice(0, 12)
  const stat = await fs.statfs('/').catch(() => null)
  return stat ? [{ mount: '/', fs: '', total: stat.blocks * stat.bsize, used: (stat.blocks - stat.bfree) * stat.bsize, free: stat.bavail * stat.bsize }] : []
}

async function osName() {
  try {
    const text = await fs.readFile('/etc/os-release', 'utf8')
    return text.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1] || `${os.type()} ${os.release()}`
  } catch { return `${os.type()} ${os.release()}` }
}

const STATES = ['active', 'inactive', 'failed', 'activating', 'deactivating', 'reloading']

export async function serviceStates() {
  const probe = await command('systemctl', ['is-system-running'], 2500)
  const systemd = !/not been booted with systemd|ENOENT|Failed to connect to bus/i.test(probe.out)
  const states = await Promise.all(SERVICES.map(async (service) => {
    if (!systemd) return { ...service, state: 'unknown', enabled: 'unknown' }
    const [active, enabled] = await Promise.all([command('systemctl', ['is-active', service.id], 2500), command('systemctl', ['is-enabled', service.id], 2500)])
    const word = active.out.trim().split('\n')[0]
    const enabledWord = enabled.out.trim().split('\n')[0]
    const missing = /could not be found|not-found|No such file/i.test(enabled.out) || enabledWord === ''
    return { ...service, state: STATES.includes(word) ? (word === 'inactive' && missing ? 'missing' : word) : 'unknown', enabled: /^[a-z-]+$/.test(enabledWord) ? enabledWord : 'unknown' }
  }))
  return { systemd, services: states }
}

/** Restarts need `sudo -n` rights on exactly these commands (see deploy/ubuntu/server-panel-install.sh). */
export async function serviceAction(id: string, action: ServiceAction) {
  if (!SERVICES.some((service) => service.id === id)) return { ok: false, out: 'سرویس ناشناخته است' }
  if (!['restart', 'reload', 'start', 'stop'].includes(action)) return { ok: false, out: 'عملیات نامعتبر است' }
  if (id === 'mobocom' && action === 'stop') return { ok: false, out: 'متوقف‌کردن خود سایت از پنل مجاز نیست' }
  const result = await command('sudo', ['-n', '/usr/bin/systemctl', action, id], 30_000)
  return result.ok ? result : { ok: false, out: /password is required|a terminal is required|not allowed|sudoers/i.test(result.out) ? 'اجازهٔ sudo برای این کار تنظیم نشده است؛ اسکریپت deploy/ubuntu/server-panel-install.sh را اجرا کنید.' : result.out.slice(0, 400) }
}

export async function topProcesses() {
  const result = await command('ps', ['-eo', 'pid,user,pcpu,pmem,etime,comm', '--sort=-pcpu'])
  if (!result.ok) return []
  return result.out.trim().split('\n').slice(1, 13).map((line) => {
    const [pid, user, cpu, mem, elapsed, ...name] = line.trim().split(/\s+/)
    return { pid: Number(pid), user, cpu: Number(cpu), mem: Number(mem), elapsed, name: name.join(' ') }
  })
}

export async function serverStatus() {
  const [cpu, mem, diskRows, name, units, processes] = await Promise.all([cpuPercent(), memory(), disks(), osName(), serviceStates(), topProcesses()])
  const nets = Object.entries(os.networkInterfaces()).flatMap(([iface, list]) => (list || []).filter((addr) => !addr.internal).map((addr) => ({ iface, address: addr.address, family: addr.family })))
  return {
    host: { hostname: os.hostname(), os: name, kernel: os.release(), arch: os.arch(), uptime: os.uptime(), node: process.version, appUptime: process.uptime(), appMemory: process.memoryUsage().rss, cwd: process.cwd(), user: os.userInfo().username },
    cpu: { percent: cpu, cores: os.cpus().length, model: os.cpus()[0]?.model || '', load: os.loadavg() },
    memory: mem,
    disks: diskRows,
    network: nets.slice(0, 12),
    systemd: units.systemd,
    services: units.services,
    processes,
  }
}
