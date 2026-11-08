import { cleanRichText } from '@/shared/content/sanitize'
import { getSiteSeo } from '@/modules/site/server/seo'
import { getAiConfig, type AiResult } from './client'
import { AiError } from './error'
import { metaPrompt, polishPrompt, sourcePrompt, oneLine, parseTagged, naturalize, toHtml, sourceCredit, slugify } from '../domain/ai'

export type EditorAssistInput = { mode?: unknown; content?: unknown; title?: unknown; source?: unknown; url?: unknown; keywords?: unknown }
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

/** Both transports use one prompt, validation and parser. Nothing here saves content. */
export async function editorAssistPlan(input: EditorAssistInput) {
  const [config, seo] = await Promise.all([getAiConfig(), getSiteSeo('fa')])
  const brand = seo.name, voice = config.voice
  const content = cleanRichText(String(input.content || '')).slice(0, 60_000)
  if (input.mode === 'excerpt') {
    if (plain(content).length < 80) throw new AiError('ابتدا متن نوشته را بنویسید')
    return { prompt: metaPrompt({ brand, voice, kind: 'مقاله', title: String(input.title || '').slice(0, 200), content: plain(content) }),
      parse: (result: AiResult) => ({ excerpt: oneLine(result.text, 160), model: result.model }) }
  }
  if (input.mode === 'polish') {
    if (plain(content).length < 80) throw new AiError('متن ویرایشگر برای بازنویسی خیلی کوتاه است')
    return { prompt: polishPrompt({ brand, voice, html: content }), parse: (result: AiResult) => {
      const html = cleanRichText(naturalize(toHtml(parseTagged(result.text).body)))
      if (plain(html).length < plain(content).length * 0.4) throw new AiError('متن بازنویسی‌شده ناقص برگشت؛ دوباره تلاش کنید', 502)
      return { content: html, model: result.model }
    } }
  }
  if (input.mode === 'source') {
    const source = String(input.source || '').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim()
    if (source.length < 200) throw new AiError('متن منبع را کامل‌تر وارد کنید (حداقل چند پاراگراف)')
    return { prompt: sourcePrompt({ brand, voice, source, keywords: String(input.keywords || '').slice(0, 300) }), parse: (result: AiResult) => {
      const { fields, body } = parseTagged(result.text)
      const html = cleanRichText(naturalize(toHtml(body)) + sourceCredit(String(input.url || '')))
      if (plain(html).length < 200) throw new AiError('متن تولیدشده خیلی کوتاه بود؛ دوباره تلاش کنید', 502)
      return { title: oneLine(fields.title || '', 120), slug: slugify(fields.slug || '', ''), excerpt: oneLine(fields.excerpt || plain(html), 160), content: html, model: result.model }
    } }
  }
  throw new AiError('حالت نامعتبر')
}
