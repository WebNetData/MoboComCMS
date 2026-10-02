export type ReleaseTarget = { platform: string; architecture: string; minVersion: string; notes: string }

/** A release can support several OS/CPU combinations; blank CPU means any. */
export function cleanReleaseTargets(input: unknown): ReleaseTarget[] {
  if (!Array.isArray(input)) throw new Error('فهرست سازگاری نامعتبر است')
  if (input.length > 20) throw new Error('حداکثر ۲۰ ترکیب سیستم‌عامل و معماری مجاز است')
  const targets = input.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('سازگاری نسخه نامعتبر است')
    const item = raw as Record<string, unknown>
    const field = (name: string, max: number) => String(item[name] ?? '').trim().slice(0, max)
    const platform = field('platform', 60)
    const architecture = field('architecture', 40)
    if (!platform || /[<>\x00-\x1f]/.test(platform + architecture)) throw new Error('سیستم‌عامل یا معماری نامعتبر است')
    return { platform, architecture, minVersion: field('minVersion', 80), notes: field('notes', 240) }
  })
  const keys = targets.map((target) => `${target.platform.toLocaleLowerCase()}\0${target.architecture.toLocaleLowerCase()}`)
  if (new Set(keys).size !== keys.length) throw new Error('ترکیب سیستم‌عامل و معماری تکراری است')
  return targets
}
