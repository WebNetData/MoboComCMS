import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import bundle from '../../domain/engineering-knowledge.generated.json'
import type { EngineeringPolicy } from '../../domain/engineering'
import { EngineeringError } from '../../domain/engineering'

/** Shipped fallback remains available; retained artifacts may carry a refreshed canonical document bundle. */
export function currentEngineeringKnowledge() {
  try {
    const raw = readFileSync(join(process.cwd(), 'src/modules/ai/domain/engineering-knowledge.generated.json'), 'utf8')
    if (raw.length > 1024 * 1024) throw new Error('knowledge-size')
    const found = JSON.parse(raw) as typeof bundle
    if (found.version !== 1 || !Array.isArray(found.entries) || found.entries.length !== bundle.entries.length || found.entries.some((entry, index) => entry.path !== bundle.entries[index].path || typeof entry.body !== 'string' || createHash('sha256').update(entry.body).digest('hex') !== entry.sha256)) throw new Error('knowledge-integrity')
    return found
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return bundle
    throw new EngineeringError('دانش معماری قابل تأیید نیست؛ هیچ دستور جایگزینی اجرا نشد', 503)
  }
}
export function engineeringKnowledge(instruction: string, policy: EngineeringPolicy, ids: unknown) {
  const bundle = currentEngineeringKnowledge()
  if (!Array.isArray(ids) || ids.length > 8 || ids.some(id => typeof id !== 'string')) throw new EngineeringError('مهارت‌های انتخابی معتبر نیستند')
  const chosen = policy.skills.filter(s => s.enabled && ids.includes(s.id))
  if (chosen.length !== new Set(ids).size) throw new EngineeringError('یکی از مهارت‌ها حذف یا غیرفعال شده است', 409)
  const rules = bundle.entries.find(entry => entry.path === 'docs/agent/AI_ENGINEERING_RULES.md')
  if (!rules) throw new EngineeringError('قواعد الزامی موبوکام در دانش بسته وجود ندارد', 503)
  const mandatory = rules.body + '\nCanonical source inventory (read relevant full files before edits):\n' + bundle.entries.map(entry => `${entry.path} sha256:${entry.sha256}`).join('\n') + '\n'
  const words = instruction.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 3)
  const excerpts = bundle.entries.flatMap(entry => entry.body.split(/\n(?=#{1,3} |[A-Z][a-z].*2026-)/).map(body => ({ path: entry.path, sha256: entry.sha256, body, score: words.reduce((n, w) => n + (body.toLowerCase().includes(w) ? 1 : 0), 0) + (entry.path.endsWith('develop/SKILL.md') ? 2 : 0) }))).sort((a, b) => b.score - a.score)
  let context = mandatory
  const pins: { path: string; sha256: string }[] = bundle.entries.map(entry => ({ path: entry.path, sha256: entry.sha256 }))
  for (const skill of chosen) {
    const text = `\nCustom skill ${skill.id} (${skill.title}):\n${skill.body}\n`
    if (JSON.stringify(context + text).length > policy.contextChars * .6) throw new EngineeringError('متن مهارت‌های انتخابی بیش از بودجهٔ زمینه است؛ مهارت‌های کمتری انتخاب کنید')
    context += text; pins.push({ path: `custom:${skill.id}`, sha256: createHash('sha256').update(skill.body).digest('hex') })
  }
  let selected = 0
  for (const row of excerpts) {
    if (row.path === rules.path) continue
    const text = `\nCanonical ${row.path}:\n${row.body.slice(0, 4200)}\n`
    if (JSON.stringify(context + text).length > Math.floor(policy.contextChars * .6)) continue
    context += text
    if (++selected >= 4) break
  }
  if (JSON.stringify(context).length > policy.contextChars * .65) throw new EngineeringError('بودجهٔ زمینه برای قواعد الزامی کافی نیست؛ سقف زمینه را افزایش دهید', 409)
  return { context, pins, bundleHash: createHash('sha256').update(JSON.stringify(bundle.entries.map(e => [e.path, e.sha256]))).digest('hex') }
}
