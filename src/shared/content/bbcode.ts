/** Bounded presentation markup. No imports, network, scripts or user-chosen CSS. */
export const TEXT_DECORATIONS = [
  { id: 'note', name: 'یادداشت', hint: 'توضیح تکمیلی و نکتهٔ مهم', code: '[note]متن یادداشت شما[/note]', icon: 'info' },
  { id: 'tip', name: 'نکتهٔ کاربردی', hint: 'ترفند و راهنمای کوتاه', code: '[tip]نکتهٔ کاربردی شما[/tip]', icon: 'bolt' },
  { id: 'warning', name: 'هشدار', hint: 'مواردی که نیاز به توجه دارند', code: '[warning]متن هشدار شما[/warning]', icon: 'flag' },
  { id: 'success', name: 'نتیجه و تأیید', hint: 'جمع‌بندی موفقیت‌آمیز', code: '[success]نتیجهٔ کار شما[/success]', icon: 'check' },
  { id: 'quote', name: 'نقل‌قول برجسته', hint: 'جمله‌ای که دیده شود', code: '[quote]نقل‌قول شما[/quote]', icon: 'quote' },
  { id: 'highlight', name: 'متن برجسته', hint: 'تأکید در میان جمله', code: '[highlight]متن برجسته[/highlight]', icon: 'sparkles' },
  { id: 'spoiler', name: 'بخش بازشونده', hint: 'جزئیات، پاسخ یا متن پنهان', code: '[spoiler]جزئیات شما[/spoiler]', icon: 'chevronDown' },
  { id: 'columns', name: 'متن دوستونه', hint: 'پاراگراف‌های مقایسه و معرفی', code: '[columns]ستون اول\n\nستون دوم[/columns]', icon: 'grid' },
] as const
const INLINE: Record<string, string> = { b: 'strong', i: 'em', u: 'u', s: 's', highlight: 'mark' }
const LABELS: Record<string, string> = { note: 'یادداشت', tip: 'نکتهٔ کاربردی', warning: 'توجه', success: 'نتیجه' }

export function decorationHtml(tag: string, body: string): string {
  if (INLINE[tag]) return `<${INLINE[tag]}${tag === 'highlight' ? ' class="mc-highlight"' : ''}>${body}</${INLINE[tag]}>`
  if (tag === 'quote') return `<blockquote class="mc-decor mc-decor-quote" data-mc-decoration="quote">${body}</blockquote>`
  if (tag === 'spoiler') return `<details class="mc-decor mc-decor-spoiler" data-mc-decoration="spoiler"><summary>نمایش جزئیات</summary><div>${body}</div></details>`
  if (tag === 'columns') return `<div class="mc-decor mc-decor-columns" data-mc-decoration="columns">${body}</div>`
  return LABELS[tag] ? `<div class="mc-decor mc-decor-${tag}" data-mc-decoration="${tag}"><p class="mc-decor-label"><strong>${LABELS[tag]}</strong></p>${body}</div>` : body
}

/** Leaves unknown/unclosed tags and code examples literal. HTML is sanitized by its existing owner afterwards. */
export function renderBBCode(input: string): string {
  if (!input.includes('[')) return input
  const protectedHtml: string[] = []
  let value = input.replace(/\u0000/g, '\ufffd').replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->|<[^>]*>/gi, html => `\u0000${protectedHtml.push(html) - 1}\u0000`)
  // Fixed grammar and a fixed number of passes bound work even for hostile nesting.
  const pairs = /\[(b|i|u|s|highlight|quote|note|tip|warning|success|spoiler|columns)\]((?:(?!\[\/?(?:b|i|u|s|highlight|quote|note|tip|warning|success|spoiler|columns)\])[\s\S])*?)\[\/\1\]/gi
  for (let depth = 0; depth < 16; depth++) {
    let changed = false
    value = value.replace(pairs, (_whole, tag: string, body: string) => {
      changed = true
      const content = tag.toLowerCase() === 'columns' ? body.split(/\r?\n\r?\n/).map(part => `<div>${part.replace(/\r?\n/g, '<br>')}</div>`).join('') : body.replace(/\r?\n/g, '<br>')
      return decorationHtml(tag.toLowerCase(), content)
    })
    if (!changed) break
  }
  return value.replace(/\u0000(\d+)\u0000/g, (_whole, id: string) => protectedHtml[Number(id)] || '')
}
